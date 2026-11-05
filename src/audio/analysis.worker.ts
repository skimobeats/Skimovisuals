// Audio analysis worker: turns raw samples into envelopes, spectra and onset curves.
// Runs off the main thread so the UI stays responsive.

export interface AnalysisRequest { samples: Float32Array; sampleRate: number; }

export interface AnalysisResult {
  rate: number;          // analysis frames per second
  frames: number;
  level: Float32Array;   // overall loudness envelope 0..1
  sub: Float32Array;     // 30 to 100 Hz
  bass: Float32Array;    // 30 to 250 Hz
  mids: Float32Array;    // 250 Hz to 2 kHz
  highs: Float32Array;   // 2 kHz to 8 kHz
  air: Float32Array;     // 8 kHz upwards
  peak: Float32Array;    // waveform peak per frame for drawing
  spectrum: Float32Array; // frames x SPEC_BANDS, 0..1
  fluxKick: Float32Array;
  fluxSnare: Float32Array;
  fluxHats: Float32Array;
  fluxOnset: Float32Array;
}

export const SPEC_BANDS = 32;
const RATE = 100;
const N = 2048;

function makeFFT(n: number) {
  const levels = Math.log2(n);
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>>= 1; }
    rev[i] = r;
  }
  return (re: Float32Array, im: Float32Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}

function percentile(arr: Float32Array, p: number) {
  const step = Math.max(1, Math.floor(arr.length / 20000));
  const s: number[] = [];
  for (let i = 0; i < arr.length; i += step) s.push(arr[i]);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 1e-9;
}

function normaliseEnvelope(raw: Float32Array, attack = 0.6, release = 0.12) {
  // convert to dB like scale, normalise to 0..1, then smooth with fast attack and slower release
  const out = new Float32Array(raw.length);
  const db = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) db[i] = 20 * Math.log10(raw[i] + 1e-7);
  const hi = percentile(db, 0.98);
  const lo = Math.max(percentile(db, 0.1), hi - 48);
  const span = Math.max(6, hi - lo);
  let y = 0;
  const a = attack, r = 1 - Math.exp(-1 / (RATE * release));
  for (let i = 0; i < raw.length; i++) {
    const x = Math.max(0, Math.min(1, (db[i] - lo) / span));
    y += (x > y ? a : r) * (x - y);
    out[i] = y;
  }
  return out;
}

function normaliseFlux(f: Float32Array) {
  const p = percentile(f, 0.995);
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.min(1.5, f[i] / (p || 1));
  return out;
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { samples, sampleRate } = e.data;
  const hop = sampleRate / RATE;
  const frames = Math.max(1, Math.floor(samples.length / hop));
  const fft = makeFFT(N);
  const re = new Float32Array(N), im = new Float32Array(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const binHz = sampleRate / N;
  const bin = (hz: number) => Math.max(1, Math.min(N / 2 - 1, Math.round(hz / binHz)));

  const bands = {
    sub: [bin(30), bin(100)], bass: [bin(30), bin(250)], mids: [bin(250), bin(2000)],
    highs: [bin(2000), bin(8000)], air: [bin(8000), bin(Math.min(16000, sampleRate / 2 - 100))]
  };
  const kickBand = [bin(35), bin(130)];
  const snareLo = [bin(150), bin(320)];
  const snareHi = [bin(1500), bin(5000)];
  const hatBand = [bin(7000), bin(Math.min(16000, sampleRate / 2 - 100))];

  // log spaced spectrum bands for spectrum visuals
  const specEdges: number[] = [];
  for (let b = 0; b <= SPEC_BANDS; b++) specEdges.push(bin(40 * Math.pow(16000 / 40, b / SPEC_BANDS)));

  const raw: Record<string, Float32Array> = {};
  for (const k of ['level', 'sub', 'bass', 'mids', 'highs', 'air']) raw[k] = new Float32Array(frames);
  const peak = new Float32Array(frames);
  const spectrum = new Float32Array(frames * SPEC_BANDS);
  const fluxKick = new Float32Array(frames), fluxSnare = new Float32Array(frames), fluxHats = new Float32Array(frames), fluxOnset = new Float32Array(frames);
  const fluxSnareBody = new Float32Array(frames);
  const prevLog = new Float32Array(N / 2);
  const curLog = new Float32Array(N / 2);
  const mag = new Float32Array(N / 2);

  const bandEnergy = (lo: number, hi: number) => { let s = 0; for (let k = lo; k <= hi; k++) s += mag[k] * mag[k]; return Math.sqrt(s / (hi - lo + 1)); };
  const prevMag = new Float32Array(N / 2);
  // linear flux favours loud hits (kick, snare) over quiet leakage
  const linFlux = (lo: number, hi: number) => { let s = 0; for (let k = lo; k <= hi; k++) { const d = mag[k] - prevMag[k]; if (d > 0) s += d; } return s; };
  const bandFlux = (lo: number, hi: number) => { let s = 0; for (let k = lo; k <= hi; k++) { const d = curLog[k] - prevLog[k]; if (d > 0) s += d; } return s / (hi - lo + 1); };

  for (let f = 0; f < frames; f++) {
    const centre = Math.floor(f * hop);
    const start = centre - N / 2;
    let rms = 0, pk = 0;
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      const s = idx >= 0 && idx < samples.length ? samples[idx] : 0;
      re[i] = s * win[i]; im[i] = 0;
    }
    const h0 = Math.max(0, centre - hop / 2), h1 = Math.min(samples.length, centre + hop / 2);
    for (let i = Math.floor(h0); i < h1; i++) { const s = samples[i]; rms += s * s; const a = Math.abs(s); if (a > pk) pk = a; }
    rms = Math.sqrt(rms / Math.max(1, h1 - h0));
    peak[f] = pk;
    raw.level[f] = rms;
    fft(re, im);
    for (let k = 0; k < N / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / (N / 4);
      mag[k] = m;
      curLog[k] = Math.log(1 + 1000 * m);
    }
    raw.sub[f] = bandEnergy(bands.sub[0], bands.sub[1]);
    raw.bass[f] = bandEnergy(bands.bass[0], bands.bass[1]);
    raw.mids[f] = bandEnergy(bands.mids[0], bands.mids[1]);
    raw.highs[f] = bandEnergy(bands.highs[0], bands.highs[1]);
    raw.air[f] = bandEnergy(bands.air[0], bands.air[1]);
    for (let b = 0; b < SPEC_BANDS; b++) {
      const lo = specEdges[b], hi = Math.max(lo, specEdges[b + 1]);
      let s = 0; for (let k = lo; k <= hi; k++) s = Math.max(s, mag[k]);
      spectrum[f * SPEC_BANDS + b] = s;
    }
    if (f > 0) {
      fluxKick[f] = linFlux(kickBand[0], kickBand[1]);
      fluxSnare[f] = linFlux(snareHi[0], snareHi[1]);
      fluxSnareBody[f] = linFlux(snareLo[0], snareLo[1]);
      fluxHats[f] = bandFlux(hatBand[0], hatBand[1]);
      fluxOnset[f] = bandFlux(1, N / 2 - 1);
    }
    prevLog.set(curLog);
    prevMag.set(mag);
    if (f % 2000 === 0) (self as any).postMessage({ progress: f / frames });
  }

  // normalise spectrum per band to 0..1 in a dB scale
  const specOut = new Float32Array(frames * SPEC_BANDS);
  for (let b = 0; b < SPEC_BANDS; b++) {
    const col = new Float32Array(frames);
    for (let f = 0; f < frames; f++) col[f] = spectrum[f * SPEC_BANDS + b];
    const env = normaliseEnvelope(col, 0.9, 0.08);
    for (let f = 0; f < frames; f++) specOut[f * SPEC_BANDS + b] = env[f];
  }
  const pk = percentile(peak, 0.999) || 1;
  for (let i = 0; i < frames; i++) peak[i] = Math.min(1, peak[i] / pk);

  const result: AnalysisResult = {
    rate: RATE, frames,
    level: normaliseEnvelope(raw.level), sub: normaliseEnvelope(raw.sub, 0.7, 0.15), bass: normaliseEnvelope(raw.bass, 0.7, 0.15),
    mids: normaliseEnvelope(raw.mids), highs: normaliseEnvelope(raw.highs, 0.8, 0.08), air: normaliseEnvelope(raw.air, 0.8, 0.06),
    peak, spectrum: specOut,
    fluxKick: new Float32Array(0), fluxSnare: new Float32Array(0), fluxHats: normaliseFlux(fluxHats), fluxOnset: normaliseFlux(fluxOnset)
  };
  // Separate kicks from snares: kicks are low with little noise, snares are noisy with a body
  const nL = normaliseFlux(fluxKick), nN = normaliseFlux(fluxSnare), nB = normaliseFlux(fluxSnareBody);
  const k = new Float32Array(frames), sn = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    k[i] = Math.max(0, nL[i] - 0.3 * nN[i]);
    sn[i] = Math.max(0, nN[i] + 0.4 * nB[i] - 0.3 * nL[i]);
  }
  result.fluxKick = normaliseFlux(k);
  result.fluxSnare = normaliseFlux(sn);
  (self as any).postMessage({ result });
};
