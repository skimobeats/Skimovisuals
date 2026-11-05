import { useState } from 'react';
import { useStore, RESOLUTIONS, FRAME_RATES, computeSize } from '../store';
import { Dialog } from './common';
import { AspectPicker } from './Welcome';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const [aspect, setAspect] = useState(project.settings.aspect);
  const [res, setRes] = useState(project.settings.resolution);
  const [fps, setFps] = useState(project.settings.fps);
  const size = computeSize(aspect, res);
  return (
    <Dialog title="Video format" onClose={onClose} width={620}>
      <div className="col" style={{ gap: 14 }}>
        <AspectPicker value={aspect} onChange={setAspect} />
        <div className="row" style={{ gap: 20 }}>
          <div className="col" style={{ gap: 4 }}>
            <label>Resolution</label>
            <div className="row" style={{ gap: 4 }}>{RESOLUTIONS.map((r) => <button key={r.id} className={res === r.id ? 'active' : ''} onClick={() => setRes(r.id)}>{r.id}</button>)}</div>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label>Frame rate</label>
            <div className="row" style={{ gap: 4 }}>{FRAME_RATES.map((f) => <button key={f} className={fps === f ? 'active' : ''} onClick={() => setFps(f)}>{f}</button>)}</div>
          </div>
        </div>
        <div className="muted small">{size.width} × {size.height} at {fps} fps. Visuals adapt to the new shape automatically.</div>
      </div>
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => { useStore.getState().update((p) => { p.settings = { ...p.settings, aspect, resolution: res, fps, ...size }; }); onClose(); }}>Apply</button>
      </div>
    </Dialog>
  );
}
