import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { playback } from '../playback';
import { Renderer } from '../engine/renderer';
import { ALL_LAYERS, PADS } from '../engine/registry';
import { perform } from '../perform';
import { fmtTime, fmtBars } from './common';

export let previewRenderer: Renderer | null = null;

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const playing = useStore((s) => s.playing);
  const previewScale = useStore((s) => s.previewScale);
  const performOpen = useStore((s) => s.performOpen);
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let r: Renderer;
    try { r = new Renderer(canvasRef.current!); } catch (e) { setError(String(e)); return; }
    previewRenderer = r;
    const canvas = canvasRef.current!;
    const onLost = (e: Event) => { e.preventDefault(); setTimeout(() => setEpoch((x) => x + 1), 300); };
    canvas.addEventListener('webglcontextlost', onLost);
    (window as any).__skimoRenderer = r;
    const errs = r.warmUp(ALL_LAYERS);
    if (errs.length) console.warn('Shader errors', errs);
    let dirty = true;
    let lastT = -1;
    const unsubStore = useStore.subscribe((s, prev) => { if (s.project !== prev.project || s.previewScale !== prev.previewScale || s.analysisVersion !== prev.analysisVersion) dirty = true; });
    const unsubPerf = perform.subscribe(() => { dirty = true; });
    r.onMediaReady = () => { dirty = true; };
    let raf = 0;
    let frames = 0; let fpsT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = useStore.getState();
      const p = st.project;
      if (!p) return;
      playback.tick();
      const t = playback.time;
      const pads = perform.activePads();
      const live = st.playing || pads.length > 0;
      if (!live && !dirty && t === lastT) return;
      dirty = false; lastT = t;
      const w = Math.round(p.settings.width * st.previewScale / 2) * 2;
      const h = Math.round(p.settings.height * st.previewScale / 2) * 2;
      r.syncVideos(p, t, false, st.playing);
      r.renderFrame(p, t, w, h, pads);
      r.present();
      if (timeRef.current) timeRef.current.textContent = `${fmtTime(t, true)} / ${fmtTime(p.duration)}`;
      if (barRef.current) barRef.current.textContent = `Bar ${fmtBars(t, p.bpm, p.beatOffset, p.beatsPerBar)}`;
      frames++;
      const now = performance.now();
      if (now - fpsT > 1000) { (window as any).__previewFps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; }
    };
    raf = requestAnimationFrame(loop);
    const unsubTime = playback.subscribe(() => { dirty = true; });
    return () => { cancelAnimationFrame(raf); unsubStore(); unsubPerf(); unsubTime(); canvas.removeEventListener('webglcontextlost', onLost); previewRenderer = null; };
  }, [epoch]);

  const project = useStore((s) => s.project)!;
  const recording = useStore((s) => s.recording);
  const placing = useStore((s) => s.placing);
  // click and drag on the preview to place a 3D hero into its scene
  const onPlaceDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const id = useStore.getState().placing;
    if (!id) return;
    const canvas = e.currentTarget;
    const set = (ev: { clientX: number; clientY: number }, history: boolean) => {
      const r = canvas.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const v = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      useStore.getState().update((p) => { const c = p.clips.find((x) => x.id === id); if (c) { c.params.sceneX = u; c.params.sceneY = v; } }, history);
    };
    set(e, true);
    const move = (ev: MouseEvent) => set(ev, false);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  return (
    <>
      <div className="preview-wrap">
        {error ? <div className="hint">{error}</div> : <canvas key={epoch} ref={canvasRef} onMouseDown={onPlaceDown} style={{ aspectRatio: `${project.settings.width} / ${project.settings.height}`, cursor: placing ? 'crosshair' : undefined }} />}
        {placing && <div className="hint" style={{ position: 'absolute', top: 16, pointerEvents: 'none' }}>Click where the shape should go. Press Done placing in the settings when you are happy.</div>}
        {!project.audio.length && (
          <div style={{ position: 'absolute', textAlign: 'center' }} className="hint">
            Start by adding your track in the <b>Audio</b> tab on the left.
          </div>
        )}
      </div>
      {performOpen && <PerformPanel />}
      <div className="transport">
        <button className="playbtn primary" onClick={() => playback.toggle()} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
        <button className="ghost" onClick={() => playback.seek(0)} title="Back to start (Home)">⏮</button>
        <span className="time" ref={timeRef}>0:00.00</span>
        <span className="muted small" ref={barRef} style={{ minWidth: 70 }} />
        {recording && <span className="rec small"><span className="recdot" />Recording</span>}
        <div className="spacer" />
        <label className="small">Preview quality</label>
        <select value={previewScale} onChange={(e) => useStore.setState({ previewScale: Number(e.target.value) })}>
          <option value={0.25}>Draft (¼)</option>
          <option value={0.5}>Good (½)</option>
          <option value={0.75}>High (¾)</option>
          <option value={1}>Full</option>
        </select>
      </div>
    </>
  );
}

function PerformPanel() {
  const recording = useStore((s) => s.recording);
  const [, force] = useState(0);
  useEffect(() => perform.subscribe(() => force((x) => x + 1)), []);
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg2)', borderTop: '1px solid var(--line)' }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <b>Perform</b>
        <span className="muted small">Hold the keys to trigger effects. Turn on record, press play, and your pads and slider moves are saved to the timeline.</span>
        <div className="spacer" />
        <button className={recording ? 'active' : ''} onClick={() => { perform.endTake(); useStore.setState({ recording: !recording }); }}>
          {recording ? '● Recording on' : '○ Record'}
        </button>
      </div>
      <div className="pads" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
        {PADS.map((p) => (
          <div key={p.id} className={'pad' + (perform.isHeld(p.id) ? ' on' : '')}
            onMouseDown={() => perform.padDown(p.id)} onMouseUp={() => perform.padUp(p.id)} onMouseLeave={() => { if (perform.isHeld(p.id)) perform.padUp(p.id); }}>
            <span className="k">{p.key}</span>{p.label}
          </div>
        ))}
      </div>
    </div>
  );
}
