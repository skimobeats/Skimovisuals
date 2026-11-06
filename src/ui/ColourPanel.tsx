import { useEffect, useState } from 'react';
import { useStore, uid } from '../store';
import { PRESET_PALETTES, findPalette, allPalettes, SKIMO_IDS, paletteFromPixels } from '../palettes';
import { platform } from '../platform';
import { listSources } from '../audio/sources';
import type { Palette, PaletteCycle, ColourReact } from '../types';
import { PaletteStrip, fmtTime, NumberInput } from './common';
import { playback } from '../playback';
import { loadPresets, savePresets } from '../projectIO';

export function PaletteList({ value, onPick, custom, multi, only, exclude }: { value: string | string[]; onPick: (id: string) => void; custom: Palette[]; multi?: boolean; only?: string[]; exclude?: string[] }) {
  const list = allPalettes(custom).filter((p) => (!only || only.includes(p.id)) && (!exclude || !exclude.includes(p.id)));
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
      {project.media.some((m) => m.kind === 'image') && (
        <div className="row" style={{ margin: '6px 0' }}>
          <span className="small muted">Take colours from</span>
          <select value="" onChange={async (e) => {
            const m = project.media.find((x) => x.id === e.target.value);
            if (!m) return;
            const colours = await coloursFromImage(platform.mediaUrl(m.path));
            const id = 'custom-' + uid();
            update((p) => { p.palettes.push({ id, name: m.name.replace(/\.[^.]+$/, ''), colours, custom: true }); p.basePaletteId = id; });
            setEditing(id);
          }}>
            <option value="">an image…</option>
            {project.media.filter((x) => x.kind === 'image').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
      <div className="small muted" style={{ margin: '8px 0 4px' }}>Skimo palettes</div>
      <PaletteList value={project.basePaletteId} custom={[]} only={SKIMO_IDS} onPick={(id) => update((p) => { p.basePaletteId = id; })} />
      <div className="small muted" style={{ margin: '8px 0 4px' }}>More swatches</div>
      <PaletteList value={project.basePaletteId} custom={project.palettes} exclude={SKIMO_IDS} onPick={(id) => update((p) => { p.basePaletteId = id; })} />

      <h4>Colours react to the music</h4>
      <ColourReactions />

      <h4>Colour changes over time</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>Switch palette at points in the song, with a smooth fade. They show on the Colour lane in the timeline.</div>
      {project.paletteKeys.map((k) => (
        <div key={k.id} className="row" style={{ marginBottom: 4 }}>
          <button className="ghost small" onClick={() => playback.seek(k.t)}>{fmtTime(k.t, true)}</button>
          <select className="grow" value={k.paletteId} onChange={(e) => update((p) => { const x = p.paletteKeys.find((y) => y.id === k.id); if (x) x.paletteId = e.target.value; })}>
            {allPalettes(project.palettes).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <NumberInput value={k.fade} min={0} max={32} step={0.5} width={55} title="Fade length in beats" onCommit={(v) => update((p) => { const x = p.paletteKeys.find((y) => y.id === k.id); if (x) x.fade = v; })} />
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
            <NumberInput value={project.paletteCycle.fade} min={0} max={16} step={0.25} width={55} onCommit={(v) => setCycle((c) => { c.fade = v; })} />
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

function coloursFromImage(url: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      const k = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(paletteFromPixels(ctx.getImageData(0, 0, c.width, c.height).data));
    };
    img.onerror = () => resolve(['#ffffff', '#888888', '#444444', '#000000']);
    img.src = url;
  });
}

const SWAP_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Off' }, { id: 'kick', label: 'Every kick' }, { id: 'snare', label: 'Every snare' }, { id: 'hats', label: 'Every hat' },
  { id: 'beat', label: 'Every beat' }, { id: 'bar', label: 'Every bar' }, { id: 'section', label: 'Every new section' }
];

function ColourReactions() {
  const project = useStore((s) => s.project)!;
  const cr = project.colourReact;
  const set = (fn: (c: ColourReact) => void, h = true) => useStore.getState().update((p) => fn(p.colourReact), h);
  const sources = listSources(project).filter((s) => s.kind !== 'beat' || s.id.includes('wave') || s.id === 'beat' || s.id === 'bar');
  const SourceSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 150 }}>
      <option value="">Off</option>
      {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  );
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="muted small">These work on top of whatever palette is showing, so every layer that uses palette colours reacts together.</div>
      <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
        <label>Swap colours</label>
        <select value={cr.swapOn} onChange={(e) => set((c) => { c.swapOn = e.target.value; })}>
          {SWAP_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <label>Shift hue with</label>
        <SourceSelect value={cr.hueSource} onChange={(v) => set((c) => { c.hueSource = v; })} />
        {cr.hueSource && <><label className="tiny">Hue amount</label><input type="range" min={0} max={0.5} step={0.01} value={cr.hueAmount} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => set((c) => { c.hueAmount = Number(e.target.value); }, false)} /></>}
        <label>Brighten with</label>
        <SourceSelect value={cr.brightSource} onChange={(v) => set((c) => { c.brightSource = v; })} />
        {cr.brightSource && <><label className="tiny">Brightness amount</label><input type="range" min={0} max={1.5} step={0.01} value={cr.brightAmount} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => set((c) => { c.brightAmount = Number(e.target.value); }, false)} /></>}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        <span className="tiny muted">Quick set:</span>
        <button className="small" onClick={() => set((c) => { c.swapOn = 'snare'; c.hueSource = 'bass'; c.hueAmount = 0.06; c.brightSource = 'kick'; c.brightAmount = 0.35; })}>Punchy</button>
        <button className="small" onClick={() => set((c) => { c.swapOn = 'bar'; c.hueSource = 'barwave'; c.hueAmount = 0.05; c.brightSource = ''; })}>Smooth</button>
        <button className="small" onClick={() => set((c) => { c.swapOn = 'section'; c.hueSource = ''; c.brightSource = 'kick'; c.brightAmount = 0.2; })}>Subtle</button>
        <button className="small" onClick={() => set((c) => { c.swapOn = ''; c.hueSource = ''; c.brightSource = ''; })}>Off</button>
      </div>
    </div>
  );
}
