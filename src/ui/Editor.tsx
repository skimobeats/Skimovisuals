import { useEffect, useState } from 'react';
import { useStore, uid, snapTime } from '../store';
import { playback } from '../playback';
import { saveProject, openProjectFile } from '../projectIO';
import { LeftPanel } from './LeftPanel';
import { Preview } from './Preview';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { GenerateDialog } from './GenerateDialog';
import { ExportDialog } from './ExportDialog';
import { SettingsDialog } from './SettingsDialog';
import { PADS } from '../engine/registry';
import { perform } from '../perform';
import type { Clip } from '../types';
import { NewProjectForm } from './Welcome';
import { Dialog } from './common';

let clipboard: Clip[] = [];

function inField(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function deleteSelection() {
  const st = useStore.getState();
  const sel = st.selection;
  if (!sel) return;
  st.update((p) => {
    if (sel.kind === 'clip') p.clips = p.clips.filter((c) => !sel.ids.includes(c.id));
    if (sel.kind === 'transition') { const c = p.clips.find((x) => x.id === sel.id); if (c) c.transitionIn = null; }
    if (sel.kind === 'marker') p.markers = p.markers.filter((m) => m.id !== sel.id);
    if (sel.kind === 'pad') p.pads = p.pads.filter((m) => m.id !== sel.id);
    if (sel.kind === 'paletteKey') p.paletteKeys = p.paletteKeys.filter((m) => m.id !== sel.id);
  });
  st.select(null);
}

export function splitAtPlayhead() {
  const st = useStore.getState();
  const t = playback.time;
  const sel = st.selection?.kind === 'clip' ? st.selection.ids : null;
  const newIds: string[] = [];
  st.update((p) => {
    const targets = p.clips.filter((c) => c.start < t - 0.01 && c.end > t + 0.01 && (!sel || sel.includes(c.id)));
    for (const c of targets) {
      const b: Clip = { ...structuredClone(c), id: uid(), start: t, fadeIn: 0 };
      c.end = t; c.fadeOut = 0;
      p.clips.push(b);
      newIds.push(b.id);
    }
  });
  if (!newIds.length) st.showToast('Put the playhead over a clip to split it');
}

export function Editor() {
  const [dialog, setDialog] = useState<null | 'generate' | 'export' | 'settings' | 'new'>(null);
  const project = useStore((s) => s.project)!;
  const dirty = useStore((s) => s.dirty);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const performOpen = useStore((s) => s.performOpen);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (inField(e) || dialog) return;
      const st = useStore.getState();
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (st.performOpen && !ctrl && !e.altKey) {
        const pad = PADS.find((p) => p.key === k);
        if (pad) { if (!e.repeat) perform.padDown(pad.id); e.preventDefault(); return; }
      }
      if (k === ' ') { e.preventDefault(); playback.toggle(); return; }
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); return; }
      if (ctrl && k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
      if (ctrl && k === 'o') { e.preventDefault(); openProjectFile(); return; }
      if (ctrl && k === 'b') { e.preventDefault(); splitAtPlayhead(); return; }
      if (ctrl && k === 'c' && st.selection?.kind === 'clip') { const ids = st.selection.ids; clipboard = structuredClone(st.project!.clips.filter((c) => ids.includes(c.id))); st.showToast(`Copied ${clipboard.length} clip${clipboard.length > 1 ? 's' : ''}`); return; }
      if (ctrl && k === 'v' && clipboard.length) {
        e.preventDefault();
        const t = playback.time; const minStart = Math.min(...clipboard.map((c) => c.start));
        const ids: string[] = [];
        st.update((p) => { for (const c of clipboard) { const n = { ...structuredClone(c), id: uid(), start: c.start - minStart + t, end: c.end - minStart + t }; if (!p.tracks.some((tr) => tr.id === n.trackId)) n.trackId = p.tracks[p.tracks.length - 1].id; p.clips.push(n); ids.push(n.id); } });
        st.select({ kind: 'clip', ids });
        return;
      }
      if (ctrl && k === 'd' && st.selection?.kind === 'clip') {
        e.preventDefault();
        const sel = st.selection.ids; const ids: string[] = [];
        st.update((p) => { for (const c of p.clips.filter((x) => sel.includes(x.id))) { const len = c.end - c.start; const n = { ...structuredClone(c), id: uid(), start: c.end, end: c.end + len }; p.clips.push(n); ids.push(n.id); } });
        st.select({ kind: 'clip', ids });
        return;
      }
      if (ctrl && k === 'a') { e.preventDefault(); st.select({ kind: 'clip', ids: st.project!.clips.map((c) => c.id) }); return; }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); return; }
      if (k === 'm' && !ctrl) {
        const t = st.snap ? snapTime(st.project!, playback.time) : playback.time;
        const id = uid();
        st.update((p) => { p.markers.push({ id, t, name: `Section ${p.markers.length + 2}`, colour: '#c9a7ff' }); p.markers.sort((a, b) => a.t - b.t); });
        st.select({ kind: 'marker', id });
        return;
      }
      if (k === 'home') { playback.seek(0); return; }
      if (k === 'end') { playback.seek(st.project!.duration); return; }
      if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
        const p = st.project!;
        const step = (60 / p.bpm) * (e.shiftKey ? p.beatsPerBar : 1);
        playback.seek(snapTime(p, playback.time) + (k === 'arrowleft' ? -step : step));
        return;
      }
      if (k === 'escape') st.select(null);
    };
    const up = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (!st.performOpen) return;
      const pad = PADS.find((p) => p.key === e.key.toLowerCase());
      if (pad) perform.padUp(pad.id);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [dialog]);

  return (
    <div className="app">
      <div className="topbar">
        <span className="logo">SKIMOVISUALS</span>
        <input className="name" value={project.name} onChange={(e) => useStore.getState().update((p) => { p.name = e.target.value; }, false)} />
        <span className="dim small">{project.settings.width}×{project.settings.height} · {project.settings.fps}fps{dirty ? ' · unsaved' : ''}</span>
        <button className="ghost small" onClick={() => setDialog('settings')} title="Change size and frame rate">⚙ Format</button>
        <div className="spacer" />
        <button className="ghost" disabled={!past} onClick={() => useStore.getState().undo()} title="Undo (Ctrl+Z)">↶</button>
        <button className="ghost" disabled={!future} onClick={() => useStore.getState().redo()} title="Redo (Ctrl+Y)">↷</button>
        <button onClick={() => setDialog('generate')} title="Build a full set of visuals for this track">✨ Generate for me</button>
        <button className={performOpen ? 'active' : ''} onClick={() => useStore.setState({ performOpen: !performOpen })} title="Play live with your keyboard and record it">🎛 Perform</button>
        <div style={{ width: 10 }} />
        <button className="ghost" onClick={() => { if (!dirty || confirm('Start a new project? Unsaved changes will be lost.')) setDialog('new'); }}>New</button>
        <button className="ghost" onClick={() => openProjectFile()}>Open</button>
        <button onClick={() => saveProject()}>Save</button>
        <button className="primary" onClick={() => setDialog('export')}>Export video</button>
      </div>
      <div className="main">
        <LeftPanel />
        <div className="centre"><Preview /></div>
        <div className="right"><Inspector /></div>
      </div>
      <Timeline />
      {dialog === 'generate' && <GenerateDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'new' && (
        <Dialog title="New project" onClose={() => setDialog(null)} width={620}>
          <NewProjectForm onCreate={() => setDialog(null)} onCancel={() => setDialog(null)} />
        </Dialog>
      )}
    </div>
  );
}
