import { useEffect, useState } from 'react';
import { useStore, uid } from '../store';
import { PRESET_PALETTES, findPalette, allPalettes } from '../palettes';
import type { Palette, PaletteCycle } from '../types';
import { PaletteStrip, fmtTime } from './common';
import { playback } from '../playback';
import { loadPresets, savePresets } from '../projectIO';

export function PaletteList({ value, onPick, custom, multi }: { value: string | string[]; onPick: (id: string) => void; custom: Palette[]; multi?: boolean }) {
  const list = allPalettes(custom);
  const isOn = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);
  return (
    <div className="col" style={{ gap: 2 }}>
      {list.map((p) => (
        <div key={p.id} className={'palette-row' + (isOn(p.id) ? ' on' : '')} onClick={() => onPick(p.id)}>
          {multi && <input type="checkbox" readOnly checked={isOn(p.id)} />}
          <PaletteStrip palette={p} />
          <span className="small">{p.name}</span>
          {p.custom && <span className="tiny dim">yours</span>}
        </div>
      ))}
    </div>
  );
}

export function ColourPanel() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const [saved, setSaved] = useState<Palette[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCycle, setShowCycle] = useState(project.paletteCycle.enabled);
  useEffect(() => { loadPresets().then((p) => setSaved(p.palettes)); }, []);

  const base = findPalette(project.basePaletteId, project.palettes);
  const editPal = project.palettes.find((p) => p.id === editing);
  const setCycle = (fn: (c: PaletteCycle) => void) => update((p) => fn(p.paletteCycle));

  const newPalette = () => {
    const id = 'custom-' + uid();
    update((p) => { p.palettes.push({ id, name: 'My palette', colours: [...base.colours], custom: true }); p.basePaletteId = id; });
    setEditing(id);
  };

  return (
    <>
      <h3>Colour</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Every visual uses four colours from the palette. Change the palette and everything follows. Layers can also use their own palette or a fixed colour.</div>

      <h4>Main palette</h4>
      <div className="row" style={{ marginBottom: 6 }}>
        <PaletteStrip palette={base} width={140} />
        <b className="small">{base.name}</b>
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button className="small" onClick={newPalette}>+ Make my own</button>
        {base.custom && <button className="small" onClick={() => setEditing(base.id)}>Edit</button>}
      </div>
      {editPal && (
        <div className="hint col" style={{ gap: 6 }}>
          <input value={editPal.name} onChange={(e) => update((p) => { const x = p.palettes.find((y) => y.id === editPal.id); if (x) x.name = e.target.value; }, false)} />
          <div className="row">
            {editPal.colours.map((c, i) => (
              <input key={i} type="color" value={c} style={{ width: 44, height: 32 }} onChange={(e) => update((p) => { const x = p.palettes.find((y) => y.id === editPal.id); if (x) x.colours[i] = e.target.value; }, false)} />
            ))}
          </div>
          <div className="tiny">Colour 1 and 2 are the main colours, 3 is an accent and 4 is usually the darkest (used for backgrounds).</div>
          <div className="row">
            <button className="small" onClick={async () => { const pr = await loadPresets(); pr.palettes = [...pr.palettes.filter((x) => x.id !== editPal.id), structuredClone(editPal)]; await savePresets(pr); setSaved(pr.palettes); useStore.getState().showToast('Saved to your palette library'); }}>Save to library</button>
            <button className="small danger" onClick={() => { update((p) => { p.palettes = p.palettes.filter((x) => x.id !== editPal.id); if (p.basePaletteId === editPal.id) p.basePaletteId = PRESET_PALETTES[0].id; }); setEditing(null); }}>Delete</button>
            <button className="ghost small" onClick={() => setEditing(null)}>Done</button>
          </div>
        </div>
      )}
      {saved.length > 0 && (
        <>
          <div className="small muted" style={{ margin: '8px 0 4px' }}>Your library</div>
          <div className="col" style={{ gap: 2 }}>
            {saved.map((s) => (
              <div key={s.id} className={'palette-row' + (project.basePaletteId === s.id ? ' on' : '')} onClick={() => update((p) => { if (!p.palettes.some((x) => x.id === s.id)) p.palettes.push(structuredClone(s)); p.basePaletteId = s.id; })}>
                <PaletteStrip palette={s} /><span className="small">{s.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="small muted" style={{ margin: '8px 0 4px' }}>Swatches</div>
      <PaletteList value={project.basePaletteId} custom={project.palettes} onPick={(id) => update((p) => { p.basePaletteId = id; })} />

      <h4>Colour changes over time</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>Switch palette at points in the song, with a smooth fade. They show on the Colour lane in the timeline.</div>
      {project.paletteKeys.map((k) => (
        <div key={k.id} className="row" style={{ marginBottom: 4 }}>
          <button className="ghost small" onClick={() => playback.seek(k.t)}>{fmtTime(k.t, true)}</button>
          <select className="grow" value={k.paletteId} onChange={(e) => update((p) => { const x = p.paletteKeys.find((y) => y.id === k.id); if (x) x.paletteId = e.target.value; })}>
            {allPalettes(project.palettes).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" min={0} max={32} step={0.5} value={k.fade} title="Fade length in beats" style={{ width: 50 }} onChange={(e) => update((p) => { const x = p.paletteKeys.find((y) => y.id === k.id); if (x) x.fade = Number(e.target.value); }, false)} />
          <button className="iconbtn" onClick={() => update((p) => { p.paletteKeys = p.paletteKeys.filter((x) => x.id !== k.id); })}>×</button>
        </div>
      ))}
      <button className="small" onClick={() => update((p) => {
        const t = playback.time;
        const others = PRESET_PALETTES.filter((x) => x.id !== p.basePaletteId);
        p.paletteKeys.push({ id: uid(), t, paletteId: others[Math.floor(Math.random() * others.length)].id, fade: 2 });
        p.paletteKeys.sort((a, b) => a.t - b.t);
      })}>+ Colour change at playhead</button>
      {project.markers.length > 0 && (
        <button className="small" style={{ marginLeft: 6 }} onClick={() => update((p) => {
          const pool = PRESET_PALETTES.map((x) => x.id);
          p.paletteKeys = p.markers.map((m, i) => ({ id: uid(), t: m.t, paletteId: pool[(pool.indexOf(p.basePaletteId) + i + 1) % pool.length], fade: 2 }));
        })}>One per section</button>
      )}

      <h4>
        <label className="row" style={{ cursor: 'pointer', color: 'inherit' }}>
          <input type="checkbox" checked={project.paletteCycle.enabled} onChange={(e) => { setCycle((c) => { c.enabled = e.target.checked; if (c.enabled && c.paletteIds.length < 2) c.paletteIds = [project.basePaletteId, ...PRESET_PALETTES.filter((x) => x.id !== project.basePaletteId).slice(0, 2).map((x) => x.id)]; }); setShowCycle(true); }} />
          Cycle palettes automatically
        </label>
      </h4>
      {(showCycle || project.paletteCycle.enabled) && (
        <div className="col" style={{ gap: 6 }}>
          <div className="muted small">Steps through the ticked palettes. This overrides the changes above while it is on.</div>
          <div className="row">
            <label className="small">Change</label>
            <select value={project.paletteCycle.every} onChange={(e) => setCycle((c) => { c.every = e.target.value as PaletteCycle['every']; })}>
              <option value="beat">Every beat</option><option value="bar">Every bar</option><option value="2bars">Every 2 bars</option>
              <option value="4bars">Every 4 bars</option><option value="8bars">Every 8 bars</option><option value="16bars">Every 16 bars</option>
              <option value="kick">Every kick</option><option value="snare">Every snare</option>
            </select>
            <label className="small">Fade</label>
            <input type="number" min={0} max={16} step={0.25} value={project.paletteCycle.fade} onChange={(e) => setCycle((c) => { c.fade = Number(e.target.value); })} style={{ width: 55 }} />
            <span className="tiny muted">beats</span>
          </div>
          <PaletteList multi value={project.paletteCycle.paletteIds} custom={project.palettes} onPick={(id) => setCycle((c) => { c.paletteIds = c.paletteIds.includes(id) ? c.paletteIds.filter((x) => x !== id) : [...c.paletteIds, id]; })} />
        </div>
      )}

      <h4>Background</h4>
      <div className="row">
        <input type="color" value={project.settings.background} onChange={(e) => update((p) => { p.settings.background = e.target.value; }, false)} />
        <span className="small muted">Shown wherever nothing else is drawn</span>
      </div>
    </>
  );
}
