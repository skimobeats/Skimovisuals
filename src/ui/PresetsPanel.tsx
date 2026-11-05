import { useEffect, useState } from 'react';
import { useStore, selectedClips } from '../store';
import { loadPresets, savePresets, clipToPreset, lookFromProject, applyLook, PresetFile } from '../projectIO';
import { addLayer } from './actions';
import { getDef } from '../engine/registry';
import { setDragData } from './LeftPanel';
import { askText } from './prompt';

export function PresetsPanel() {
  const [presets, setPresets] = useState<PresetFile | null>(null);
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project)!;
  useEffect(() => { loadPresets().then(setPresets); }, []);
  if (!presets) return null;
  const save = async (p: PresetFile) => { await savePresets(p); setPresets({ ...p }); };
  const sel = selection?.kind === 'clip' ? selectedClips() : [];

  return (
    <>
      <h3>Presets</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Presets are shared between all your projects, so your releases can keep a consistent look.</div>

      <h4>Whole looks</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>Save every layer, effect and colour change in this project, then apply it to another song. Timings stretch to fit the new tempo.</div>
      <button className="small" disabled={!project.clips.length} onClick={async () => {
        const name = await askText('Name this look', project.name + ' look');
        if (!name) return;
        await save({ ...presets, looks: [...presets.looks, lookFromProject(project, name)] });
        useStore.getState().showToast('Look saved');
      }}>Save this project's look</button>
      <div className="col" style={{ gap: 4, marginTop: 8 }}>
        {presets.looks.map((l) => (
          <div key={l.id} className="row hint" style={{ margin: 0 }}>
            <span className="grow" style={{ color: 'var(--text)' }}>{l.name}<br /><span className="tiny">{l.clips.length} layers</span></span>
            <button className="small primary" onClick={() => {
              if (project.clips.length && !confirm('Replace everything on the timeline with this look?')) return;
              useStore.getState().update((p) => applyLook(p, l));
            }}>Apply</button>
            <button className="iconbtn" onClick={() => confirm(`Delete ${l.name}?`) && save({ ...presets, looks: presets.looks.filter((x) => x.id !== l.id) })}>×</button>
          </div>
        ))}
      </div>

      <h4>Single layers</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>Save a layer you have tweaked, with all its settings and audio links, to reuse it.</div>
      <button className="small" disabled={sel.length !== 1} onClick={async () => {
        const name = await askText('Name this preset', sel[0].name);
        if (!name) return;
        await save({ ...presets, layers: [...presets.layers, clipToPreset(sel[0], name)] });
        useStore.getState().showToast('Layer preset saved');
      }}>{sel.length === 1 ? `Save "${sel[0].name}"` : 'Select one layer to save it'}</button>
      <div className="cards" style={{ marginTop: 8 }}>
        {presets.layers.map((lp) => (
          <div key={lp.id} className="card" draggable onDragStart={(e) => setDragData(e, { preset: lp.id })} onDoubleClick={() => addLayer(lp.clip.type, structuredClone(lp.clip))}>
            <div className="title">{lp.name}</div>
            <div className="desc">{getDef(lp.clip.type).name}</div>
            <div className="row" style={{ marginTop: 4 }}>
              <button className="small primary" onClick={() => addLayer(lp.clip.type, structuredClone(lp.clip))}>Add</button>
              {sel.length > 0 && sel.every((c) => c.type === lp.clip.type) && (
                <button className="small" title="Copy these settings onto the selected layers" onClick={() => useStore.getState().update((p) => {
                  for (const c of p.clips) if (sel.some((s) => s.id === c.id)) { c.params = structuredClone(lp.clip.params); c.mods = structuredClone(lp.clip.mods); c.blend = lp.clip.blend; c.opacity = lp.clip.opacity; }
                })}>Apply</button>
              )}
              <button className="iconbtn" onClick={() => confirm(`Delete ${lp.name}?`) && save({ ...presets, layers: presets.layers.filter((x) => x.id !== lp.id) })}>×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export async function presetById(id: string) {
  const p = await loadPresets();
  return p.layers.find((x) => x.id === id);
}
