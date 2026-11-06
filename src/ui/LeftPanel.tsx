import { useMemo, useState } from 'react';
import { useStore, Panel } from '../store';
import { ALL_LAYERS } from '../engine/registry';
import { platform } from '../platform';
import { addLayer, importMedia, importMediaPaths } from './actions';
import { layerThumbnails } from './thumbnails';
import { AudioPanel } from './AudioPanel';
import { ColourPanel } from './ColourPanel';
import { PresetsPanel } from './PresetsPanel';
import { TEXT_FONTS } from '../engine/layers/media';
import { TRANSITIONS } from '../engine/transitions';
import { HERO_SHAPES } from '../engine/hero';
import { selectedClips } from '../store';
import logoUrl from '../assets/skimo-logo.png';
import type { Clip } from '../types';
import { mod } from '../engine/layers/types';

const TABS: { id: Panel; label: string; ico: string }[] = [
  { id: 'audio', label: 'Audio', ico: '♫' },
  { id: 'skimo', label: 'Skimo', ico: '◢' },
  { id: 'media', label: 'Media', ico: '🖼' },
  { id: 'generators', label: 'Visuals', ico: '✺' },
  { id: 'effects', label: 'Effects', ico: '✧' },
  { id: 'transitions', label: 'Transitions', ico: '⧓' },
  { id: 'colour', label: 'Colour', ico: '🎨' },
  { id: 'presets', label: 'Presets', ico: '★' }
];

export function setDragData(e: React.DragEvent, data: object) {
  e.dataTransfer.setData('application/x-skimo', JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'copy';
}

export function LeftPanel() {
  const panel = useStore((s) => s.panel);
  return (
    <div className="left">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (panel === t.id ? ' on' : '')} onClick={() => useStore.setState({ panel: t.id })}>
            <span className="ico">{t.ico}</span>{t.label}
          </button>
        ))}
      </div>
      <div className="panel">
        {panel === 'audio' && <AudioPanel />}
        {panel === 'media' && <MediaPanel />}
        {panel === 'generators' && <LayerLibrary category="generator" title="Visuals" hint="Generated visuals. Drag one onto the timeline or press + to add it at the playhead." />}
        {panel === 'effects' && <LayerLibrary category="effect" title="Effects" hint="Effects change everything on the tracks below them. Put them above your visuals." />}
        {(panel === 'skimo' || panel === 'text') && <SkimoPanel />}
        {panel === 'transitions' && <TransitionsPanel />}
        {panel === 'colour' && <ColourPanel />}
        {panel === 'presets' && <PresetsPanel />}
      </div>
    </div>
  );
}

function LayerLibrary({ category, title, hint }: { category: string; title: string; hint: string }) {
  const basePal = useStore((s) => s.project!.basePaletteId);
  const thumbs = useMemo(() => layerThumbnails(basePal), [basePal]);
  const [q, setQ] = useState('');
  const defs = ALL_LAYERS.filter((d) => d.category === category && d.id !== 'hero' && (!q || (d.name + d.description).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <h3>{title}</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>{hint}</div>
      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      {category === 'generator' && !q && (
        <>
          <h4 style={{ marginTop: 0 }}>3D hero shapes</h4>
          <div className="muted tiny" style={{ marginBottom: 6 }}>Shards push out with the kick, snare and hats, breathe with the bass and burst apart on drops. Put them under the Skimo logo.</div>
          <div className="cards" style={{ marginBottom: 12 }}>
            {HERO_SHAPES.map((name, i) => (
              <div key={name} className="card" draggable onDragStart={(e) => setDragData(e, { type: 'hero', heroShape: i, name })} onDoubleClick={() => addHero(i, name)}>
                {thumbs.get('hero:' + i) ? <img className="thumb" src={thumbs.get('hero:' + i)} /> : <div className="thumb" />}
                <div className="title">{name}</div>
                <button className="add primary small" onClick={() => addHero(i, name)} title="Add at playhead">+</button>
              </div>
            ))}
          </div>
          <h4>2D visuals</h4>
        </>
      )}
      <div className="cards">
        {defs.map((d) => (
          <div key={d.id} className="card" draggable onDragStart={(e) => setDragData(e, { type: d.id })} title={d.description} onDoubleClick={() => addLayer(d.id)}>
            {thumbs.get(d.id) ? <img className="thumb" src={thumbs.get(d.id)} /> : <div className="thumb" />}
            <div className="title">{d.name}</div>
            <div className="desc">{d.description}</div>
            <button className="add primary small" onClick={() => addLayer(d.id)} title="Add at playhead">+</button>
          </div>
        ))}
      </div>
    </>
  );
}

function MediaPanel() {
  const media = useStore((s) => s.project!.media);
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <h3>Media</h3>
      <div className={'dropzone' + (over ? ' over' : '')}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); importMediaPaths(Array.from(e.dataTransfer.files).map((f) => platform.pathForFile(f))); }}>
        Drop images or videos here<br />
        <button style={{ marginTop: 8 }} onClick={() => importMedia()}>Browse…</button>
      </div>
      {media.length > 0 && (
        <div className="hint">
          Click to pick several, then add them as one layer that morphs between them.
          <div className="row" style={{ marginTop: 6 }}>
            <button className="primary small" disabled={!picked.length} onClick={() => { addLayer('media', { mediaIds: picked, name: picked.length > 1 ? 'Image sequence' : media.find((m) => m.id === picked[0])?.name }); setPicked([]); }}>
              Add {picked.length || ''} as a layer
            </button>
            <button className="small" onClick={() => addLayer('media', { mediaIds: media.map((m) => m.id), name: 'All images' })}>Add all</button>
            {picked.length > 0 && <button className="ghost small" onClick={() => setPicked([])}>Clear</button>}
          </div>
        </div>
      )}
      <div className="cards" style={{ marginTop: 8 }}>
        {media.map((m) => (
          <div key={m.id} className="card media-card" draggable onDragStart={(e) => setDragData(e, { type: 'media', mediaIds: picked.includes(m.id) && picked.length > 1 ? picked : [m.id] })}
            onClick={() => toggle(m.id)} style={picked.includes(m.id) ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}>
            {m.kind === 'image' ? <img className="thumb" src={platform.mediaUrl(m.path)} /> : <video className="thumb" src={platform.mediaUrl(m.path)} muted />}
            {picked.includes(m.id) && <span className="badge">{picked.indexOf(m.id) + 1}</span>}
            <div className="title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
            <div className="desc">{m.kind === 'video' ? `Video · ${m.duration?.toFixed(1)}s` : `${m.width}×${m.height}`}</div>
            <button className="add small danger" title="Remove from project" onClick={(e) => {
              e.stopPropagation();
              if (!confirm(`Remove ${m.name} from the project?`)) return;
              useStore.getState().update((p) => {
                p.media = p.media.filter((x) => x.id !== m.id);
                for (const c of p.clips) if (c.mediaIds) c.mediaIds = c.mediaIds.filter((x) => x !== m.id);
              });
            }}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}

// Ready made logo looks: settings plus which parts of the music drive them
const LOGO_LOOKS: { name: string; desc: string; params: Record<string, number>; mods: Clip['mods'] }[] = [
  { name: 'Reactive', desc: 'Each letter reacts to its own part of the track and the shape glitches on hits.', params: {}, mods: {} },
  { name: 'Clean', desc: 'Calm and confident. Letters flash on the kick only, the shape just breathes.', params: { shadow: 0.35 },
    mods: { s: mod('kick', 0.7, 0.2), k: mod('kick', 0.7, 0.2), i: mod('kick', 0.7, 0.2), m: mod('kick', 0.7, 0.2), o: mod('kick', 0.7, 0.2), breathe: mod('bass', 0.4, 0.3) } },
  { name: 'Print', desc: 'Screen print feel: inks slip out of line on the snare, heavy paper texture.', params: { texture: 0.8, letterFx: 3 },
    mods: { slip: mod('snare', 0.8, 0.25), s: mod('kick', 0.8, 0.2), k: mod('snare', 0.8, 0.2), i: mod('hats', 0.6, 0.1), m: mod('bass', 0.6, 0.3), o: mod('mids', 0.6, 0.3), skew: mod('kick', 0.1, 0.2) } },
  { name: 'Chaos', desc: 'For drops. Heavy glitching, jolts, stretch and shatter flashes.', params: { letterFx: 5 },
    mods: { glitch: mod('snare', 0.8, 0.15), jolt: mod('hats', 0.6, 0.1), stretch: mod('kick', 0.35, 0.2), skew: mod('kick', 0.3, 0.15), shatter: mod('snare', 0.25, 0.12), slip: mod('kick', 0.5, 0.2), s: mod('kick', 1, 0.2), k: mod('snare', 1, 0.2), i: mod('hats', 1, 0.1), m: mod('bass', 1, 0.3), o: mod('mids', 1, 0.3), pulse: mod('kick', 0.4, 0.2) } },
  { name: 'Melt', desc: 'Slow and woozy for breakdowns. The shape drips and wobbles with the bass.', params: { melt: 0.25, morphShape: 3 },
    mods: { morph: mod('bass', 0.5, 0.4), breathe: mod('bass', 0.8, 0.4), melt: mod('mids', 0.3, 0.4), m: mod('bass', 0.8, 0.3), o: mod('mids', 0.8, 0.3) } }
];

function addHero(shape: number, name: string) {
  const id = addLayer('hero', { name });
  useStore.getState().update((p) => { const c = p.clips.find((x) => x.id === id); if (c) { c.params.shape = shape; c.blend = 'normal'; } }, false);
}

function SkimoPanel() {
  const project = useStore((s) => s.project)!;
  const [text, setText] = useState('SKIMO');
  const [font, setFont] = useState('Archivo Variable');
  const [look, setLook] = useState(0);
  const song = project.name && project.name !== 'Untitled' ? project.name : 'TRACK NAME';
  const addLogo = (whole: boolean) => {
    const l = LOGO_LOOKS[look];
    const extra: Partial<Clip> = { name: `Skimo Logo (${l.name})` };
    const id = whole
      ? addLayer('logo', extra, 0, undefined, project.duration)
      : addLayer('logo', extra);
    if (l.params || Object.keys(l.mods).length) useStore.getState().update((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c.params, l.params);
      if (Object.keys(l.mods).length) c.mods = structuredClone(l.mods);
    }, false);
  };
  const titles: { name: string; extra: Partial<Clip>; params?: Record<string, number> }[] = [
    { name: `SKIMO:${song.toUpperCase()}`, extra: { text: `SKIMO:${song}`, upper: true, wide: true, letterSpacing: 0.04, font: 'Archivo Variable' }, params: { scale: 0.55, y: -0.78 } },
    { name: song.toUpperCase(), extra: { text: song, upper: true, wide: true, letterSpacing: 0.08, font: 'Archivo Variable' }, params: { scale: 0.45, y: -0.8 } },
    { name: `SKIMO · No. 01`, extra: { text: 'SKIMO · No. 01', upper: true, wide: true, letterSpacing: 0.12, font: 'Archivo Variable' }, params: { scale: 0.32, y: 0.85 } }
  ];
  return (
    <>
      <h3>Skimo</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Your stencil logo. Everything underneath shows through the letters, each letter reacts to its own part of the track and the shape glitches, skews and morphs with the music.</div>
      <div style={{ borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg, #f08a2c, #b04a32 40%, #111114)', padding: 14 }}>
        <div style={{ background: 'var(--accent)', WebkitMaskImage: `url(${logoUrl})`, maskImage: `url(${logoUrl})`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', aspectRatio: '2.06', backgroundColor: '#1fb5c8' }} />
      </div>
      <h4>Logo style</h4>
      <div className="col" style={{ gap: 4 }}>
        {LOGO_LOOKS.map((l, i) => (
          <div key={l.name} className={'palette-row' + (look === i ? ' on' : '')} onClick={() => setLook(i)}>
            <div><div className="small" style={{ color: 'var(--text)' }}>{l.name}</div><div className="tiny muted">{l.desc}</div></div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={() => addLogo(true)}>Add logo for the whole song</button>
        <button onClick={() => addLogo(false)}>Add at playhead</button>
      </div>
      <div className="hint">Put the logo on the top track so everything else shows through it. Every reaction is a normal setting you can change or relink with 🔗.</div>

      <h4>Titles</h4>
      <div className="col" style={{ gap: 4 }}>
        {titles.map((tl) => (
          <div key={tl.name} className="card" style={{ cursor: 'grab' }} draggable onDragStart={(e) => setDragData(e, { type: 'text', ...tl.extra })}
            onDoubleClick={() => addTitle(tl)}>
            <div className="title" style={{ fontFamily: 'Archivo Variable', fontStretch: '125%', letterSpacing: '0.06em' }}>{tl.name}</div>
            <button className="add primary small" onClick={() => addTitle(tl)}>+</button>
          </div>
        ))}
      </div>

      <h4>Any text</h4>
      <div className="col">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Any words…" />
        <select value={font} onChange={(e) => setFont(e.target.value)} style={{ fontFamily: font }}>
          {TEXT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f === 'Archivo Variable' ? 'Archivo (Skimo titles)' : f}</option>)}
        </select>
        <button onClick={() => addLayer('text', { text, font, name: text.split('\n')[0].slice(0, 30) })}>Add text at playhead</button>
      </div>
    </>
  );
}

function addTitle(tl: { name: string; extra: Partial<Clip>; params?: Record<string, number> }) {
  const id = addLayer('text', { ...tl.extra, name: tl.name, fadeIn: 0.6, fadeOut: 0.8 });
  if (tl.params) useStore.getState().update((p) => { const c = p.clips.find((x) => x.id === id); if (c) Object.assign(c.params, tl.params, { colour: '#ffffff', tint: 1 }); }, false);
}

function TransitionsPanel() {
  useStore((s) => s.selection);
  const sel = selectedClips();
  const project = useStore((s) => s.project)!;
  const target = sel.length === 1 ? sel[0] : null;
  const prev = target ? project.clips.find((c) => c !== target && c.trackId === target.trackId && Math.abs(c.end - target.start) < 0.05) : null;
  return (
    <>
      <h3>Transitions</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>Drag a transition onto the join between two clips that touch on the same track. Anything on a higher track still sits on top.</div>
      {target && (
        <div className="hint">{prev ? <>Click a transition to put it at the start of <b>{target.name}</b>.</> : <>The selected clip has nothing touching its start on the same track. Line two clips up end to start (snapping helps) and the join can take a transition.</>}</div>
      )}
      <div className="cards">
        {TRANSITIONS.map((t) => (
          <div key={t.id} className="card" draggable onDragStart={(e) => setDragData(e, { transition: t.id })} title={t.description}
            onClick={() => { if (target && prev) useStore.getState().update((p) => { const c = p.clips.find((x) => x.id === target.id); if (c) c.transitionIn = { type: t.id, duration: Math.max(0.25, Math.min(1.5, (60 / p.bpm) * 2)) }; }); }}>
            <div className="title">⧓ {t.name}</div>
            <div className="desc">{t.description}</div>
          </div>
        ))}
      </div>
    </>
  );
}
