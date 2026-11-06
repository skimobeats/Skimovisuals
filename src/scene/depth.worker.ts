// Runs the depth model off the main thread. Uses the graphics card (WebGPU) when it can, otherwise the processor.
import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';

ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href, mjs: new URL(mjsUrl, self.location.href).href };
ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';

let session: ort.InferenceSession | null = null;
let provider = '';

self.onmessage = async (e: MessageEvent) => {
  const { id, model, input, size } = e.data as { id: number; model?: ArrayBuffer; input: Float32Array; size: number };
  try {
    if (!session) {
      if (!model) throw new Error('The depth model was not loaded');
      const gpu = 'gpu' in navigator;
      try {
        session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: gpu ? ['webgpu'] : ['wasm'] });
        provider = gpu ? 'graphics card' : 'processor';
      } catch {
        session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });
        provider = 'processor';
      }
    }
    const name = session.inputNames[0];
    const tensor = new ort.Tensor('float32', input, [1, 3, size, size]);
    const out = await session.run({ [name]: tensor });
    const res = out[session.outputNames[0]];
    const data = res.data as Float32Array;
    const dims = res.dims;
    const h = dims[dims.length - 2], w = dims[dims.length - 1];
    // normalise to 0 (far) .. 1 (near). The model's values bunch up in the distance,
    // so store the square root to keep detail there; square it again to get nearness back.
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const depth = new Uint8Array(w * h);
    const span = hi - lo || 1;
    for (let i = 0; i < w * h; i++) depth[i] = Math.round(Math.sqrt(Math.max(0, (data[i] - lo) / span)) * 255);
    (self as any).postMessage({ id, depth, w, h, provider }, [depth.buffer]);
  } catch (err) {
    (self as any).postMessage({ id, error: String(err) });
  }
};
