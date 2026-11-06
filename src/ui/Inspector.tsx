import { useEffect, useRef, useState } from 'react';
import { useStore, selectedClips } from '../store';
import { getDef, PAD_MAP } from '../engine/registry';
import type { ParamDef } from '../engine/layers/types';
import type { Clip, Modulation, Project } from '../types';
import { playback } from '../playback';
import { listSources, sampleSource } from '../audio/sources';
import { baseValue, paletteAt } from '../engine/params';
import { allPalettes, rgbToHex } from '../palettes';
import { perform } from '../perform';
import { fmtTime, NumberInput } from './common';
import { CATEGORY_COLOUR } from './actions';
import { platform } from '../platform';
import { TEXT_FONTS } from '../engine/layers/media';
import { BLEND_MODES } from '../engine/glsl';
import { deleteSelection } from './Editor';
import { TRANSITIONS } from '../engine/transitions';

function updateClip(id: string, fn: (c: Clip) => void, history = true) {
  useStore.getState().update((p) => { const c = p.clips.find((x) => x.id === id); if (c) fn(c); }, history);
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project)!;
  if (!selection) return <NothingSelected />;
  if (selection.kind === 'clip') {
    const clips = project.clips.filter((c) => selection.ids.includes(c.id));
    if (clips.length === 0) return <NothingSelected />;
    if (clips.length > 1) return <MultiClip clips={clips} />;
    return <ClipInspector clip={clips[0]} />;
  }
  if (selection.kind === 'transition') {
    const c = project.clips.find((x) => x.id === selection.id);
    if (!c || !c.transitionIn) return <NothingSelected />;
    const tr = c.transitionIn;
    const upd = (fn: (x: NonNullable<Clip['transitionIn']>) => void) => updateClip(c.id, (cl) => { if (cl.transitionIn) fn(cl.transitionIn); });
    return (
      <div className="insp">
        <div className="insp-head"><b>Transition into {c.name}</b></div>
        <div className="kv">
          <label>Length</label>
          <div className="row"><NumberInput value={tr.duration} min={0.05} max={8} step={0.05} decimals={2} onCommit={(v) => upd((x) => { x.duration = v; })} /><span className="tiny muted">seconds</span></div>
          <span />
          <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
            {[0.5, 1, 2, 4].map((b) => <button key={b} className="small" onClick={() => upd((x) => { x.duration = (60 / project.bpm) * b; })}>{b} beat{b === 1 ? '' : 's'}</button>)}
          </div>
        </div>
        <h4 className="muted small" style={{ margin: '12px 0 6px' }}>Style</h4>
        <div className="col" style={{ gap: 4 }}>
          {TRANSITIONS.map((d) => (
            <div key={d.id} className={'palette-row' + (tr.type === d.id ? ' on' : '')} onClick={() => upd((x) => { x.type = d.id; })}>
              <div><div className="small" style={{ color: 'var(--text)' }}>{d.name}</div><div className="tiny muted">{d.description}</div></div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="danger" onClick={deleteSelection}>Remove transition</button></div>
      </div>
    );
  }
  if (selection.kind === 'marker') {
    const m = project.markers.find((x) => x.id === selection.id);
    if (!m) return <NothingSelected />;
    const upd = (fn: (x: NonNullable<typeof m>) => void, h = true) => useStore.getState().update((p) => { const x = p.markers.find((y) => y.id === m.id); if (x) fn(x); }, h);
    return (
      <div className="insp">
        <div className="insp-head"><span className="dot" style={{ background: m.colour }} /><b>Section marker</b></div>
        <div className="kv">
          <label>Name</label><input value={m.name} onChange={(e) => upd((x) => { x.name = e.target.value; }, false)} />
          <label>Time</label><TimeInput value={m.t} onChange={(v) => upd((x) => { x.t = v; })} />
          <label>Colour</label><input type="color" value={m.colour} onChange={(e) => upd((x) => { x.colour = e.target.value; }, false)} />
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="danger" onClick={deleteSelection}>Delete marker</button></div>
      </div>
    );
  }
  if (selection.kind === 'paletteKey') {
    const k = project.paletteKeys.find((x) => x.id === selection.id);
    if (!k) return <NothingSelected />;
    const upd = (fn: (x: NonNullable<typeof k>) => void, h = true) => useStore.getState().update((p) => { const x = p.paletteKeys.find((y) => y.id === k.id); if (x) fn(x); }, h);
    return (
      <div className="insp">
        <div className="insp-head"><b>Colour change</b></div>
        <div className="kv">
          <label>Time</label><TimeInput value={k.t} onChange={(v) => upd((x) => { x.t = v; })} />
          <label>Fade (beats)</label><NumberInput value={k.fade} min={0} max={32} step={0.25} onCommit={(v) => upd((x) => { x.fade = v; })} />
        </div>
        <h4 className="muted small" style={{ margin: '12px 0 6px' }}>Change to</h4>
        <div className="col" style={{ gap: 2 }}>
          {allPalettes(project.palettes).map((pal) => (
            <div key={pal.id} className={'palette-row' + (k.paletteId === pal.id ? ' on' : '')} onClick={() => upd((x) => { x.paletteId = pal.id; })}>
              <div className="palette-strip">{pal.colours.map((c, i) => <div key={i} style={{ background: c }} />)}</div>
              <span className="small">{pal.name}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="danger" onClick={deleteSelection}>Delete colour change</button></div>
      </div>
    );
  }
  if (selection.kind === 'pad') {
    const e = project.pads.find((x) => x.id === selection.id);
    if (!e) return <NothingSelected />;
    const upd = (fn: (x: NonNullable<typeof e>) => void) => useStore.getState().update((p) => { const x = p.pads.find((y) => y.id === e.id); if (x) fn(x); });
    return (
      <div className="insp">
        <div className="insp-head"><b>Recorded pad: {PAD_MAP.get(e.pad)?.label}</b></div>
        <div className="kv">
          <label>Start</label><TimeInput value={e.start} onChange={(v) => upd((x) => { x.start = v; })} />
          <label>End</label><TimeInput value={e.end} onChange={(v) => upd((x) => { x.end = Math.max(x.start + 0.02, v); })} />
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="danger" onClick={deleteSelection}>Delete</button></div>
      </div>
    );
  }
  return <NothingSelected />;
}

function NothingSelected() {
  return (
    <div className="insp">
      <h3 style={{ marginBottom: 8 }}>Settings</h3>
      <div className="muted small col">
        <span>Select something on the timeline to change it here.</span>
        <span><b>Quick start</b></span>
        <span>1. Load your track in the Audio tab and type the BPM.</span>
        <span>2. Press <b>✨ Generate for me</b>, or drag visuals, images and effects onto the timeline yourself.</span>
        <span>3. Click any layer, then use the 🔗 button next to a setting to make it react to the kick, snare, bass and more.</span>
        <span>4. Export when you are happy.</span>
        <span><b>Shortcuts</b></span>
        <span>Space play · Ctrl+Z undo · Ctrl+B split · Ctrl+D duplicate · Ctrl+C / V copy and paste · Delete remove · M add section marker · ← → move a beat (Shift for a bar) · Ctrl+scroll to zoom the timeline</span>
      </div>
    </div>
  );
}

function MultiClip({ clips }: { clips: Clip[] }) {
  const ids = clips.map((c) => c.id);
  return (
    <div className="insp">
      <div className="insp-head"><b>{clips.length} layers selected</b></div>
      <div className="kv">
        <label>Opacity</label>
        <input type="range" min={0} max={1} step={0.01} defaultValue={clips[0].opacity} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => useStore.getState().update((p) => { for (const c of p.clips) if (ids.includes(c.id)) c.opacity = Number(e.target.value); }, false)} />
        <label>Colours</label>
        <PaletteOverride value={clips[0].paletteId ?? null} onChange={(v) => useStore.getState().update((p) => { for (const c of p.clips) if (ids.includes(c.id)) c.paletteId = v; })} />
      </div>
      <div className="row" style={{ marginTop: 12 }}><button className="danger" onClick={deleteSelection}>Delete all</button></div>
    </div>
  );
}

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => { setText(value.toFixed(2)); }, [value]);
  return (
    <div className="row">
      <input type="number" step={0.01} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { const v = Number(text); if (!isNaN(v)) onChange(Math.max(0, v)); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="tiny muted">{fmtTime(value, true)}</span>
      <button className="iconbtn" title="Set to playhead" onClick={() => onChange(playback.time)}>⌖</button>
    </div>
  );
}

function PaletteOverride({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const project = useStore((s) => s.project)!;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Follow the song's colours</option>
      {allPalettes(project.palettes).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function ClipInspector({ clip }: { clip: Clip }) {
  const project = useStore((s) => s.project)!;
  const def = getDef(clip.type);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = new Map<string, ParamDef[]>();
  for (const p of def.params) {
    const g = p.group || 'Main';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  const isVideo = clip.mediaIds?.some((id) => project.media.find((m) => m.id === id)?.kind === 'video');
  return (
    <div className="insp">
      <div className="insp-head">
        <span className="dot" style={{ background: CATEGORY_COLOUR[def.category] }} />
        <input className="grow" value={clip.name} onChange={(e) => updateClip(clip.id, (c) => { c.name = e.target.value; }, false)} style={{ fontWeight: 600 }} />
      </div>
      <div className="muted tiny" style={{ marginBottom: 8 }}>{def.name}: {def.description}</div>

      <div className="group">
        <div className="kv">
          <label>Start</label><TimeInput value={clip.start} onChange={(v) => updateClip(clip.id, (c) => { const len = c.end - c.start; c.start = v; c.end = v + len; })} />
          <label>End</label><TimeInput value={clip.end} onChange={(v) => updateClip(clip.id, (c) => { c.end = Math.max(c.start + 0.1, v); })} />
          <label>Fade in</label>
          <div className="row">
            <NumberInput value={clip.fadeIn} min={0} max={Math.max(0.1, clip.end - clip.start)} step={0.1} decimals={2} onCommit={(v) => updateClip(clip.id, (c) => { c.fadeIn = v; })} />
            <span className="tiny muted">seconds</span>
          </div>
          <label>Fade out</label>
          <div className="row">
            <NumberInput value={clip.fadeOut} min={0} max={Math.max(0.1, clip.end - clip.start)} step={0.1} decimals={2} onCommit={(v) => updateClip(clip.id, (c) => { c.fadeOut = v; })} />
            <span className="tiny muted">seconds</span>
          </div>
          <label>Opacity</label>
          <input type="range" min={0} max={1} step={0.01} value={clip.opacity} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => updateClip(clip.id, (c) => { c.opacity = Number(e.target.value); }, false)} />
          <label>Blend</label>
          <select value={clip.blend} onChange={(e) => updateClip(clip.id, (c) => { c.blend = e.target.value as Clip['blend']; })}>
            {BLEND_MODES.map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
          </select>
          <label>Colours</label>
          <PaletteOverride value={clip.paletteId ?? null} onChange={(v) => updateClip(clip.id, (c) => { c.paletteId = v; })} />
        </div>
      </div>

      {def.category === 'text' && (
        <div className="group col">
          <textarea rows={2} value={clip.text || ''} onChange={(e) => updateClip(clip.id, (c) => { c.text = e.target.value; }, false)} onFocus={() => useStore.getState().checkpoint()} />
          <select value={clip.font || 'Archivo Variable'} onChange={(e) => updateClip(clip.id, (c) => { c.font = e.target.value; })} style={{ fontFamily: clip.font }}>
            {TEXT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f === 'Archivo Variable' ? 'Archivo (Skimo titles)' : f}</option>)}
          </select>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="row small"><input type="checkbox" checked={!!clip.upper} onChange={(e) => updateClip(clip.id, (c) => { c.upper = e.target.checked; })} />Capitals</label>
            <label className="row small"><input type="checkbox" checked={!!clip.wide} onChange={(e) => updateClip(clip.id, (c) => { c.wide = e.target.checked; })} />Wide letters</label>
          </div>
          <div className="row"><span className="small muted" style={{ width: 100 }}>Letter spacing</span>
            <input type="range" min={-0.05} max={0.5} step={0.01} value={clip.letterSpacing ?? 0} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => updateClip(clip.id, (c) => { c.letterSpacing = Number(e.target.value); }, false)} />
          </div>
        </div>
      )}

      {def.category === 'media' && <MediaList clip={clip} />}
      {isVideo && (
        <div className="group kv">
          <label>Video starts at</label>
          <NumberInput value={clip.mediaOffset || 0} min={0} step={0.1} decimals={2} onCommit={(v) => updateClip(clip.id, (c) => { c.mediaOffset = v; })} />
        </div>
      )}

      {[...groups.entries()].map(([g, params]) => (
        <div key={g} className="group">
          <div className="group-title" onClick={() => setCollapsed((s) => ({ ...s, [g]: !s[g] }))}>
            <span>{g}</span><span>{collapsed[g] ? '▸' : '▾'}</span>
          </div>
          {!collapsed[g] && params.map((p) => <ParamRow key={p.key} clip={clip} p={p} project={project} />)}
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="small" onClick={() => updateClip(clip.id, (c) => { for (const p of def.params) c.params[p.key] = p.def; c.mods = structuredClone(def.defaultMods || {}); c.keys = {}; })}>Reset settings</button>
        <button className="small danger" onClick={deleteSelection}>Delete layer</button>
      </div>
    </div>
  );
}

function MediaList({ clip }: { clip: Clip }) {
  const project = useStore((s) => s.project)!;
  const ids = clip.mediaIds || [];
  const unused = project.media.filter((m) => !ids.includes(m.id));
  return (
    <div className="group">
      <div className="group-title"><span>Images in this layer ({ids.length})</span></div>
      <div className="col" style={{ gap: 4 }}>
        {ids.map((id, i) => {
          const m = project.media.find((x) => x.id === id);
          if (!m) return null;
          return (
            <div key={id + i} className="row">
              {m.kind === 'image' ? <img src={platform.mediaUrl(m.path)} style={{ width: 44, height: 28, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ width: 44 }} className="tiny">video</span>}
              <span className="small grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <button className="iconbtn" disabled={i === 0} onClick={() => updateClip(clip.id, (c) => { const a = c.mediaIds!; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>↑</button>
              <button className="iconbtn" onClick={() => updateClip(clip.id, (c) => { c.mediaIds = c.mediaIds!.filter((_, j) => j !== i); })}>×</button>
            </div>
          );
        })}
      </div>
      {unused.length > 0 && (
        <select value="" onChange={(e) => { const v = e.target.value; if (v === '__all') updateClip(clip.id, (c) => { c.mediaIds = [...(c.mediaIds || []), ...unused.map((m) => m.id)]; }); else if (v) updateClip(clip.id, (c) => { c.mediaIds = [...(c.mediaIds || []), v]; }); }} style={{ marginTop: 6, width: '100%' }}>
          <option value="">+ Add an image from your media…</option>
          <option value="__all">Add all remaining ({unused.length})</option>
          {unused.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {ids.length < 2 && <div className="tiny muted" style={{ marginTop: 4 }}>Add two or more to morph between them. The Sequence settings below control when and how.</div>}
    </div>
  );
}

const QUICK = [{ id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' }, { id: 'hats', label: 'Hats' }, { id: 'bass', label: 'Bass' }, { id: 'level', label: 'Level' }, { id: 'beat', label: 'Beat' }];

function ParamRow({ clip, p, project }: { clip: Clip; p: ParamDef; project: Project }) {
  const [, force] = useState(0);
  const [showMod, setShowMod] = useState(false);
  useEffect(() => playback.subscribe(() => { if (clip.keys[p.key]?.length) force((x) => x + 1); }), [clip.keys[p.key]]);
  const mod = clip.mods[p.key];
  const keys = clip.keys[p.key];
  const t = playback.time;

  if (p.type === 'select') {
    return (
      <div className="param">
        <div className="plabel"><span className="name">{p.label}</span></div>
        <select style={{ width: '100%' }} value={Number(clip.params[p.key] ?? p.def)} onChange={(e) => updateClip(clip.id, (c) => { c.params[p.key] = Number(e.target.value); })}>
          {p.options!.map((o, i) => <option key={i} value={i}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (p.type === 'bool') {
    return (
      <div className="param">
        <label className="plabel" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={!!clip.params[p.key]} onChange={(e) => updateClip(clip.id, (c) => { c.params[p.key] = e.target.checked; })} />
          <span className="name">{p.label}</span>
        </label>
      </div>
    );
  }
  if (p.type === 'colour') {
    const v = String(clip.params[p.key] ?? p.def);
    const pal = paletteAt(project, t, clip.paletteId).map((c) => rgbToHex(c[0], c[1], c[2]));
    const custom = /^p[0-3]$/.test(v) ? pal[Number(v[1])] : v;
    return (
      <div className="param">
        <div className="plabel"><span className="name">{p.label}</span></div>
        <div className="swatches">
          {pal.map((c, i) => <div key={i} className={'swatch' + (v === 'p' + i ? ' on' : '')} style={{ background: c }} title={`Palette colour ${i + 1} (follows palette changes)`} onClick={() => updateClip(clip.id, (cl) => { cl.params[p.key] = 'p' + i; })} />)}
          <span className="tiny muted" style={{ margin: '0 4px' }}>or</span>
          <input type="color" value={custom} title="Fixed colour" onChange={(e) => updateClip(clip.id, (cl) => { cl.params[p.key] = e.target.value; }, false)} onFocus={() => useStore.getState().checkpoint()} />
        </div>
      </div>
    );
  }

  const value = baseValue(clip, p, keys?.length ? t : 0);
  const min = p.min ?? 0, max = p.max ?? 1;
  const step = p.step ?? (max - min) / 200;
  const setValue = (v: number, history: boolean) => {
    if (perform.recordParam(clip.id, p.key, v)) return;
    updateClip(clip.id, (c) => {
      const ks = c.keys[p.key];
      if (ks && ks.length) {
        const near = ks.find((k) => Math.abs(k.t - playback.time) < 0.05);
        if (near) near.v = v; else { ks.push({ t: playback.time, v }); ks.sort((a, b) => a.t - b.t); }
      } else c.params[p.key] = v;
    }, history);
  };
  const nearKey = keys?.find((k) => Math.abs(k.t - t) < 0.05);
  const fmt = (v: number) => (step >= 1 ? String(Math.round(v)) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

  return (
    <div className="param">
      <div className="plabel">
        <span className="name">{p.label}</span>
        <button className={'iconbtn' + (mod ? ' on' : '')} title="Make this react to the music" onClick={() => setShowMod((s) => !s || !mod ? !s : s)}>🔗</button>
        <button className={'iconbtn' + (keys?.length ? ' keyed' : '')} title={keys?.length ? (nearKey ? 'Remove keyframe here' : 'Add keyframe here') : 'Animate this setting over time (adds a keyframe at the playhead)'}
          onClick={() => updateClip(clip.id, (c) => {
            const ks = c.keys[p.key] || [];
            const nk = ks.find((k) => Math.abs(k.t - playback.time) < 0.05);
            if (nk) c.keys[p.key] = ks.filter((k) => k !== nk);
            else { c.keys[p.key] = [...ks, { t: playback.time, v: value }].sort((a, b) => a.t - b.t); }
            if (!c.keys[p.key].length) delete c.keys[p.key];
          })}>{nearKey ? '◆' : '◇'}</button>
        <NumberInput className="val" plain value={Number(fmt(value))} min={min} max={max} onCommit={(v) => setValue(v, true)} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onPointerDown={() => useStore.getState().checkpoint()}
        onChange={(e) => setValue(Number(e.target.value), false)} />
      {keys && keys.length > 0 && (
        <div className="row tiny muted">
          <span>Animated ({keys.length} keyframes)</span>
          <button className="iconbtn tiny" onClick={() => { const prev = [...keys].reverse().find((k) => k.t < t - 0.06); if (prev) playback.seek(prev.t); }}>◀</button>
          <button className="iconbtn tiny" onClick={() => { const next = keys.find((k) => k.t > t + 0.06); if (next) playback.seek(next.t); }}>▶</button>
          <button className="iconbtn tiny" onClick={() => updateClip(clip.id, (c) => { c.params[p.key] = value; delete c.keys[p.key]; })}>Clear</button>
        </div>
      )}
      {(mod || showMod) && <ModEditor clip={clip} p={p} mod={mod} />}
    </div>
  );
}

function ModEditor({ clip, p, mod }: { clip: Clip; p: ParamDef; mod?: Modulation }) {
  const project = useStore((s) => s.project)!;
  const sources = listSources(project);
  const groups = [...new Set(sources.map((s) => s.group))];
  const setMod = (fn: (m: Modulation) => void, history = true) => updateClip(clip.id, (c) => {
    const m = c.mods[p.key] || { source: 'kick', amount: 0.5, decay: 0.2 };
    fn(m); c.mods[p.key] = m;
  }, history);
  if (!mod) {
    return (
      <div className="modbox">
        <div className="tiny muted" style={{ marginBottom: 4 }}>React to:</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {QUICK.map((q) => <button key={q.id} className="small" onClick={() => setMod((m) => { m.source = q.id; m.amount = 0.5; m.decay = q.id === 'kick' ? 0.2 : q.id === 'beat' ? 0.25 : 0.15; })}>{q.label}</button>)}
          <select className="small" value="" onChange={(e) => e.target.value && setMod((m) => { m.source = e.target.value; })}>
            <option value="">More…</option>
            {groups.map((g) => <optgroup key={g} label={g}>{sources.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
          </select>
        </div>
      </div>
    );
  }
  const src = sources.find((s) => s.id === mod.source);
  const usesDecay = src?.kind === 'hits' || mod.source === 'beat' || mod.source === 'bar';
  return (
    <div className="modbox">
      <div className="row">
        <span className="tiny muted">Reacts to</span>
        <select className="grow" value={mod.source} onChange={(e) => setMod((m) => { m.source = e.target.value; })}>
          {groups.map((g) => <optgroup key={g} label={g}>{sources.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>)}
          {!src && <option value={mod.source}>{mod.source} (missing)</option>}
        </select>
        <button className="iconbtn" title="Stop reacting" onClick={() => updateClip(clip.id, (c) => { delete c.mods[p.key]; })}>×</button>
      </div>
      <div className="row">
        <span className="tiny muted" style={{ width: 52 }}>Amount</span>
        <input type="range" min={-1} max={1} step={0.01} value={mod.amount} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => setMod((m) => { m.amount = Number(e.target.value); }, false)} />
        <span className="tiny muted" style={{ width: 34, textAlign: 'right' }}>{Math.round(mod.amount * 100)}%</span>
      </div>
      {usesDecay && (
        <div className="row">
          <span className="tiny muted" style={{ width: 52 }}>Release</span>
          <input type="range" min={0.02} max={2} step={0.01} value={mod.decay} onPointerDown={() => useStore.getState().checkpoint()} onChange={(e) => setMod((m) => { m.decay = Number(e.target.value); }, false)} />
          <span className="tiny muted" style={{ width: 34, textAlign: 'right' }}>{mod.decay.toFixed(2)}s</span>
        </div>
      )}
      <ModMeter source={mod.source} decay={mod.decay} />
    </div>
  );
}

function ModMeter({ source, decay }: { source: string; decay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = useStore.getState().project;
      if (!p || !ref.current) return;
      ref.current.style.width = `${Math.round(sampleSource(p, source, playback.time, decay) * 100)}%`;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [source, decay]);
  return <div style={{ background: 'var(--bg3)', borderRadius: 2, marginTop: 4 }}><div ref={ref} className="modbar" /></div>;
}

export { selectedClips };
