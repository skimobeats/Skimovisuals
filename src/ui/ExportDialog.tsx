import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { platform, dirName } from '../platform';
import { ExportJob, ExportProgress } from '../exporter';
import { Dialog, fmtTime } from './common';
import { playback } from '../playback';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const filePath = useStore((s) => s.filePath);
  const [quality, setQuality] = useState<'high' | 'max' | 'small'>('high');
  const [encoder, setEncoder] = useState<'auto' | 'nvenc' | 'cpu'>('auto');
  const [range, setRange] = useState<'all' | 'selection' | 'preview'>('all');
  const [nvenc, setNvenc] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; path: string } | null>(null);
  const job = useRef<ExportJob | null>(null);
  const { width, height, fps } = project.settings;

  useEffect(() => { platform.api?.exportProbe().then((r) => setNvenc(r.nvenc)); }, []);

  const sel = useStore.getState().selection;
  const selClips = sel?.kind === 'clip' ? project.clips.filter((c) => sel.ids.includes(c.id)) : [];
  const rangeFor = () => {
    if (range === 'selection' && selClips.length) return { start: Math.min(...selClips.map((c) => c.start)), end: Math.max(...selClips.map((c) => c.end)) };
    if (range === 'preview') return { start: playback.time, end: Math.min(project.duration, playback.time + 15) };
    return { start: 0, end: project.duration };
  };
  const r = rangeFor();

  const start = async () => {
    if (!project.audio.length) { alert('Add your track first.'); return; }
    const paths = await platform.paths();
    const dir = filePath ? dirName(filePath) : paths.videos;
    const out = await platform.saveFile({ title: 'Export video', defaultPath: `${dir}${dir.includes('\\') ? '\\' : '/'}${project.name || 'visuals'}.mp4`, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
    if (!out) return;
    playback.pause();
    const j = new ExportJob();
    job.current = j;
    setResult(null);
    setProgress({ frame: 0, total: 1, fps: 0, eta: 0, encoder: '' });
    const res = await j.run(project, { outPath: out, encoder, quality, ...r }, setProgress);
    job.current = null;
    setProgress(null);
    setResult({ ...res, path: out });
  };

  return (
    <Dialog title="Export video" onClose={progress ? undefined : onClose} width={520}>
      {!progress && !result && (
        <div className="col" style={{ gap: 12 }}>
          <div className="hint">MP4 · {width} × {height} · {fps} fps · H.264 with AAC audio. Change the size from ⚙ Format at the top.</div>
          <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <label>What to export</label>
            <div className="row">
              <button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>Whole song</button>
              <button className={range === 'selection' ? 'active' : ''} disabled={!selClips.length} onClick={() => setRange('selection')}>Selected clips</button>
              <button className={range === 'preview' ? 'active' : ''} onClick={() => setRange('preview')}>15 sec test</button>
            </div>
            <span />
            <span className="small muted">{fmtTime(r.start, true)} to {fmtTime(r.end, true)}</span>
            <label>Quality</label>
            <div className="row">
              <button className={quality === 'small' ? 'active' : ''} onClick={() => setQuality('small')}>Smaller file</button>
              <button className={quality === 'high' ? 'active' : ''} onClick={() => setQuality('high')}>High</button>
              <button className={quality === 'max' ? 'active' : ''} onClick={() => setQuality('max')}>Maximum</button>
            </div>
            <label>Encoder</label>
            <div className="row">
              <select value={encoder} onChange={(e) => setEncoder(e.target.value as typeof encoder)}>
                <option value="auto">Automatic</option>
                <option value="nvenc">NVIDIA graphics card</option>
                <option value="cpu">Processor (slower)</option>
              </select>
              <span className="small muted">{nvenc === null ? 'Checking…' : nvenc ? 'NVIDIA encoder found ✓' : 'Using the processor'}</span>
            </div>
          </div>
          <div className="muted tiny">Social apps re-compress uploads, so High is usually plenty. Maximum is good for archiving.</div>
        </div>
      )}
      {progress && (
        <div className="col" style={{ gap: 10 }}>
          <div className="progress"><div style={{ width: `${(progress.frame / progress.total) * 100}%` }} /></div>
          <div className="row small">
            <span>Frame {progress.frame} of {progress.total}</span>
            <div className="spacer" />
            <span className="muted">{progress.fps.toFixed(1)} fps · about {fmtTime(progress.eta)} left</span>
          </div>
          {progress.encoder && <div className="tiny muted">Encoding with {progress.encoder}</div>}
        </div>
      )}
      {result && (
        <div className={'hint'} style={{ color: result.ok ? 'var(--good)' : 'var(--bad)', whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
          {result.ok ? `Done! Saved to\n${result.path}` : result.message}
        </div>
      )}
      <div className="actions">
        {progress ? <button onClick={() => job.current?.cancel()}>Cancel</button> : <button onClick={onClose}>Close</button>}
        {result?.ok && <button onClick={() => platform.showItem(result.path)}>Show in folder</button>}
        {!progress && <button className="primary" onClick={start}>{result ? 'Export again' : 'Export'}</button>}
      </div>
    </Dialog>
  );
}
