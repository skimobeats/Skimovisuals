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

const TABS: { id: Panel; label: string; ico: string }[] = [
  { id: 'audio', label: 'Audio', ico: '♫' },
  { id: 'media', label: 'Media', ico: '🖼' },
  { id: 'generators', label: 'Visuals', ico: '✺' },
  { id: 'effects', label: 'Effects', ico: '✧' },
  { id: 'text', label: 'Text', ico: 'T' },
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
        {panel === 'text' && <TextPanel />}
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
  const defs = ALL_LAYERS.filter((d) => d.category === category && (!q || (d.name + d.description).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <h3>{title}</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>{hint}</div>
      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
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

function TextPanel() {
  const [text, setText] = useState('SKIMO');
  const [font, setFont] = useState('Arial Black');
  return (
    <>
      <h3>Text</h3>
      <div className="col">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Artist name, track title…" />
        <select value={font} onChange={(e) => setFont(e.target.value)} style={{ fontFamily: font }}>
          {TEXT_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="row">
          <button className="primary" onClick={() => addLayer('text', { text, font, name: text.split('\n')[0].slice(0, 30) })}>Add text at playhead</button>
          <div draggable onDragStart={(e) => setDragData(e, { type: 'text', text, font })} className="muted small" style={{ cursor: 'grab' }}>or drag ⠿</div>
        </div>
        <div className="hint">Text uses the same effects as images: pulse, glitch, melt, break into particles and more. Pick it on the timeline to adjust.</div>
      </div>
    </>
  );
}
