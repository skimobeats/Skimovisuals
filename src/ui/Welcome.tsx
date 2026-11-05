import { useState } from 'react';
import { ASPECTS, RESOLUTIONS, FRAME_RATES, computeSize, newProject, useStore } from '../store';
import { openProjectFile } from '../projectIO';
import { platform } from '../platform';
import { clearAudio } from '../audio/audio';

export function AspectPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="choice-grid">
      {ASPECTS.map((a) => {
        const scale = 34 / Math.max(a.w, a.h);
        return (
          <div key={a.id} className={'choice' + (value === a.id ? ' on' : '')} onClick={() => onChange(a.id)}>
            <div className="shape" style={{ width: a.w * scale, height: a.h * scale }} />
            <div style={{ fontWeight: 600 }}>{a.id}</div>
            <div className="lbl">{a.label.replace(a.id, '').trim() || ' '}</div>
          </div>
        );
      })}
    </div>
  );
}

export function NewProjectForm({ onCreate, onCancel }: { onCreate: () => void; onCancel?: () => void }) {
  const [name, setName] = useState('Untitled');
  const [aspect, setAspect] = useState('9:16');
  const [res, setRes] = useState('1080p');
  const [fps, setFps] = useState(30);
  const size = computeSize(aspect, res);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row"><label style={{ width: 90 }}>Project name</label><input className="grow" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <label>Shape</label>
        <div style={{ marginTop: 6 }}><AspectPicker value={aspect} onChange={setAspect} /></div>
      </div>
      <div className="row" style={{ gap: 20 }}>
        <div className="col" style={{ gap: 4 }}>
          <label>Resolution</label>
          <div className="row" style={{ gap: 4 }}>
            {RESOLUTIONS.map((r) => <button key={r.id} className={res === r.id ? 'active' : ''} onClick={() => setRes(r.id)}>{r.id}</button>)}
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label>Frame rate</label>
          <div className="row" style={{ gap: 4 }}>
            {FRAME_RATES.map((f) => <button key={f} className={fps === f ? 'active' : ''} onClick={() => setFps(f)}>{f}</button>)}
          </div>
        </div>
      </div>
      <div className="muted small">Output will be {size.width} × {size.height} at {fps} frames per second. You can change this later.</div>
      <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        <button className="primary" onClick={() => {
          clearAudio();
          useStore.getState().setProject(newProject({ name, aspect, resolution: res, fps }));
          useStore.setState({ panel: 'audio' });
          onCreate();
        }}>Create project</button>
      </div>
    </div>
  );
}

export function Welcome({ autosavePath }: { autosavePath: () => Promise<string> }) {
  return (
    <div className="welcome">
      <div className="box">
        <h1>Skimovisuals</h1>
        <div className="tag">Drop in a track, get visuals that move with your music.</div>
        <div className="dialog" style={{ width: '100%', boxShadow: 'none' }}>
          <h2>New project</h2>
          <NewProjectForm onCreate={() => {}} />
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button onClick={() => openProjectFile()}>Open project…</button>
          <button className="ghost" onClick={async () => {
            const p = await autosavePath();
            if (await platform.exists(p)) { await openProjectFile(p); useStore.setState({ filePath: null, dirty: true }); }
            else alert('There is no autosave yet.');
          }}>Recover last autosave</button>
        </div>
      </div>
    </div>
  );
}
