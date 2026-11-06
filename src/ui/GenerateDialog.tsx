import { useState } from 'react';
import { useStore } from '../store';
import { STYLES, generate, GenerateOptions, findSections } from '../generate';
import { Dialog } from './common';
import { analyses } from '../audio/audio';

let lastOpts: GenerateOptions | null = null;

export function GenerateDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const [opts, setOpts] = useState<GenerateOptions>(lastOpts || { style: 'skimo', colours: 'skimo', intensity: 0.65, useMedia: true, logo: true, title: '', seed: Math.floor(Math.random() * 100000) });
  const set = (p: Partial<GenerateOptions>) => setOpts((o) => ({ ...o, ...p }));
  const ready = analyses.has('mix');
  const sections = ready ? findSections(project) : [];

  const run = (newSeed: boolean) => {
    const o = { ...opts, seed: newSeed ? Math.floor(Math.random() * 100000) : opts.seed };
    lastOpts = o;
    setOpts(o);
    useStore.getState().update((p) => generate(p, o));
    useStore.getState().select(null);
  };

  return (
    <Dialog title="✨ Generate for me" onClose={onClose} width={640}>
      {!ready ? (
        <div className="hint">Load your track in the Audio tab first, then come back here.</div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          <div className="muted small">
            Builds a full set of layers that follow your track: calmer visuals in breakdowns, more energy in the drops, colour changes between sections and everything linked to your kicks, snares and bass. It then all stays fully editable.
            {' '}{project.markers.length ? `Using your ${project.markers.length} section markers.` : `No section markers yet, so it found ${sections.length} sections from the energy of the track.`}
          </div>
          <div>
            <label>Style</label>
            <div className="choice-grid" style={{ marginTop: 6 }}>
              {STYLES.map((s) => (
                <div key={s.id} className={'choice' + (opts.style === s.id ? ' on' : '')} onClick={() => set({ style: s.id })} title={s.description}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{s.name}</div>
                  <div className="lbl">{s.description}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
            <label>Colours</label>
            <div className="row">
              {(['skimo', 'pastel', 'style', 'any'] as const).map((c) => <button key={c} className={opts.colours === c ? 'active' : ''} onClick={() => set({ colours: c })}>{c === 'skimo' ? 'Skimo' : c === 'pastel' ? 'Pastels' : c === 'style' ? 'Suit the style' : 'Anything'}</button>)}
            </div>
            <label>Energy</label>
            <div className="row"><span className="tiny muted">Calm</span><input type="range" min={0} max={1} step={0.01} value={opts.intensity} onChange={(e) => set({ intensity: Number(e.target.value) })} /><span className="tiny muted">Wild</span></div>
            <label>Skimo logo</label>
            <label className="row"><input type="checkbox" checked={opts.logo} onChange={(e) => set({ logo: e.target.checked })} /><span className="small">On top most of the time, reacting to the music</span></label>
            <label>Use my images</label>
            <label className="row"><input type="checkbox" checked={opts.useMedia && project.media.length > 0} disabled={!project.media.length} onChange={(e) => set({ useMedia: e.target.checked })} /><span className="small">{project.media.length ? `${project.media.length} in your media` : 'Add some in the Media tab first'}</span></label>
            <label>Title text</label>
            <input value={opts.title} placeholder="Optional, e.g. SKIMO:CONNECTING MEMORY" onChange={(e) => set({ title: e.target.value })} />
          </div>
          {project.clips.length > 0 && <div className="hint">This replaces what is on the timeline. You can always undo with Ctrl+Z.</div>}
        </div>
      )}
      <div className="actions">
        <button onClick={onClose}>Close</button>
        {ready && lastOpts && <button onClick={() => run(true)} title="Same settings, different result">🎲 Try another</button>}
        {ready && <button className="primary" onClick={() => { run(!lastOpts); onClose(); }}>Generate</button>}
      </div>
    </Dialog>
  );
}
