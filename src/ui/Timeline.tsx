import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, uid, addTrack, makeClip } from '../store';
import { playback } from '../playback';
import { analyses, laneDefs, LaneDef } from '../audio/audio';
import { getDef, PAD_MAP } from '../engine/registry';
import { findPalette } from '../palettes';
import type { Clip, Project } from '../types';
import { lastHitIndex } from '../audio/sources';
import { defaultLength } from './actions';
import { splitAtPlayhead, deleteSelection } from './Editor';
import { presetById } from './PresetsPanel';
import { fmtTime } from './common';
import { TRANSITION_MAP } from '../engine/transitions';

function FadeRamps({ w, h, fi, fo }: { w: number; h: number; fi: number; fo: number }) {
  if (fi <= 0 && fo <= 0) return null;
  return (
    <svg className="fadesvg" width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {fi > 0 && <polygon points={`0,0 ${fi},0 0,${h}`} fill="rgba(0,0,0,0.45)" />}
      {fi > 0 && <line x1={0} y1={h} x2={fi} y2={0} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />}
      {fo > 0 && <polygon points={`${w - fo},0 ${w},0 ${w},${h}`} fill="rgba(0,0,0,0.45)" />}
      {fo > 0 && <line x1={w - fo} y1={0} x2={w} y2={h} stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} />}
    </svg>
  );
}

const RULER_H = 24;
const WAVE_H = 44;
const HIT_H = 18;
const SPECIAL_H = 22;
const TRACK_H = 44;

interface Layout { lanes: { id: string; label: string; y: number; h: number; kind: 'wave' | 'hits' | 'colour' | 'perform'; lane?: LaneDef }[]; tracksY: number; total: number; }

function computeLayout(p: Project, showPerform: boolean): Layout {
  const lanes: Layout['lanes'] = [];
  let y = RULER_H;
  lanes.push({ id: 'wave', label: 'Audio', y, h: WAVE_H, kind: 'wave' }); y += WAVE_H;
  for (const l of laneDefs(p)) { lanes.push({ id: l.id, label: l.label, y, h: HIT_H, kind: 'hits', lane: l }); y += HIT_H; }
  lanes.push({ id: 'colour', label: 'Colour', y, h: SPECIAL_H, kind: 'colour' }); y += SPECIAL_H;
  if (showPerform) { lanes.push({ id: 'perform', label: 'Perform', y, h: SPECIAL_H, kind: 'perform' }); y += SPECIAL_H; }
  return { lanes, tracksY: y, total: y + p.tracks.length * TRACK_H + 60 };
}

function gridStep(p: Project, zoom: number) {
  const beat = 60 / p.bpm;
  const beatPx = beat * zoom;
  if (beatPx >= 48) return beat / 4;
  if (beatPx >= 24) return beat / 2;
  if (beatPx >= 8) return beat;
  return beat * p.beatsPerBar;
}

export function Timeline() {
  const project = useStore((s) => s.project)!;
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const snap = useStore((s) => s.snap);
  const performOpen = useStore((s) => s.performOpen);
  useStore((s) => s.analysisVersion);
  const [height, setHeight] = useState(340);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(800);
  const [dropTrack, setDropTrack] = useState<string | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const showPerform = performOpen || project.pads.length > 0;
  const layout = computeLayout(project, showPerform);
  const width = Math.max(viewW, project.duration * zoom + 200);
  const tracksTop = [...project.tracks].reverse(); // top of the list is the top layer
  const trackY = (id: string) => layout.tracksY + tracksTop.findIndex((t) => t.id === id) * TRACK_H;

  // ---------- drawing ----------
  const draw = useCallback(() => {
    const c = canvasRef.current, rc = rulerRef.current, sc = scrollRef.current;
    if (!c || !rc || !sc) return;
    const p = useStore.getState().project!;
    const z = useStore.getState().zoom;
    const dpr = window.devicePixelRatio || 1;
    const w = sc.clientWidth, h = layout.total;
    const sl = sc.scrollLeft;
    for (const [cv, ch] of [[c, h], [rc, RULER_H]] as const) {
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(ch * dpr); cv.style.width = w + 'px'; cv.style.height = ch + 'px'; }
    }
    c.style.left = sl + 'px'; rc.style.left = sl + 'px';
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t0 = sl / z, t1 = (sl + w) / z;
    const beat = 60 / p.bpm, bar = beat * p.beatsPerBar;
    const step = gridStep(p, z);
    // grid
    const first = Math.floor((t0 - p.beatOffset) / step);
    for (let i = first; ; i++) {
      const t = p.beatOffset + i * step;
      if (t > t1) break;
      if (t < 0) continue;
      const x = Math.round(t * z - sl) + 0.5;
      const isBar = Math.abs(((t - p.beatOffset) / bar) - Math.round((t - p.beatOffset) / bar)) < 1e-4;
      g.strokeStyle = isBar ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      g.beginPath(); g.moveTo(x, RULER_H); g.lineTo(x, h); g.stroke();
    }
    // end of song
    const ex = p.duration * z - sl;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ex, 0, w, h);
    // waveform
    const mix = analyses.get('mix');
    const wl = layout.lanes.find((l) => l.kind === 'wave')!;
    if (mix) {
      const mid = wl.y + wl.h / 2;
      g.fillStyle = 'rgba(201,167,255,0.55)';
      for (let x = 0; x < w; x++) {
        const ta = (sl + x) / z, tb = (sl + x + 1) / z;
        const ia = Math.max(0, Math.floor(ta * mix.rate)), ib = Math.min(mix.frames, Math.max(ia + 1, Math.ceil(tb * mix.rate)));
        let m = 0; for (let i = ia; i < ib; i++) if (mix.peak[i] > m) m = mix.peak[i];
        const hh = m * (wl.h / 2 - 3);
        if (hh > 0.3) g.fillRect(x, mid - hh, 1, hh * 2);
      }
    }
    // hit lanes
    for (const l of layout.lanes) {
      if (l.kind !== 'hits' || !l.lane) continue;
      const hits = p.hits[l.id] || [];
      g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(0, l.y, w, l.h);
      g.fillStyle = l.lane.colour;
      let i = Math.max(0, lastHitIndex(hits, t0));
      for (; i < hits.length && hits[i].t <= t1; i++) {
        const x = hits[i].t * z - sl;
        const hh = Math.max(4, hits[i].s * (l.h - 4));
        g.globalAlpha = 0.5 + hits[i].s * 0.5;
        g.fillRect(x - 1, l.y + l.h - 2 - hh, 3, hh);
      }
      g.globalAlpha = 1;
    }
    // lane separators
    g.fillStyle = '#34343f';
    for (const l of layout.lanes) g.fillRect(0, l.y + l.h - 1, w, 1);
    for (let i = 0; i <= p.tracks.length; i++) g.fillRect(0, layout.tracksY + i * TRACK_H - 1, w, 1);
    // ruler
    const r = rc.getContext('2d')!;
    r.setTransform(dpr, 0, 0, dpr, 0, 0);
    r.fillStyle = '#1a1a20'; r.fillRect(0, 0, w, RULER_H);
    r.font = '10px Segoe UI, sans-serif'; r.fillStyle = '#9a9aab'; r.strokeStyle = '#4a4a58';
    const barPx = bar * z;
    const every = barPx > 60 ? 1 : barPx > 25 ? 2 : barPx > 12 ? 4 : barPx > 6 ? 8 : 16;
    const fb = Math.floor((t0 - p.beatOffset) / bar);
    for (let b = Math.max(0, fb); ; b++) {
      const t = p.beatOffset + b * bar;
      if (t > t1) break;
      const x = Math.round(t * z - sl) + 0.5;
      if (b % every === 0) { r.beginPath(); r.moveTo(x, 10); r.lineTo(x, RULER_H); r.stroke(); r.fillText(String(b + 1), x + 3, 11); }
      else if (barPx > 4) { r.beginPath(); r.moveTo(x, 18); r.lineTo(x, RULER_H); r.stroke(); }
    }
    r.fillStyle = '#6c6c7c';
    const secEvery = z > 30 ? 5 : z > 10 ? 15 : 30;
    for (let s = Math.floor(t0 / secEvery) * secEvery; s <= t1; s += secEvery) {
      const x = s * z - sl;
      r.fillText(fmtTime(s), x + 2, RULER_H - 3);
    }
  }, [layout.total, layout.tracksY, layout.lanes.length]);

  useLayoutEffect(() => { draw(); });
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (scrollRef.current) setViewW(scrollRef.current.clientWidth); draw(); });
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [draw]);

  // playhead follows playback
  useEffect(() => playback.subscribe((t) => {
    const z = useStore.getState().zoom;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${t * z}px)`;
    const sc = scrollRef.current;
    if (sc && useStore.getState().playing) {
      const x = t * z;
      if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = x - 60;
    }
  }), []);
  useEffect(() => { if (playheadRef.current) playheadRef.current.style.transform = `translateX(${playback.time * zoom}px)`; }, [zoom]);

  const onScroll = () => {
    const sc = scrollRef.current!;
    if (headsRef.current) headsRef.current.scrollTop = sc.scrollTop;
    setScrollLeft(sc.scrollLeft);
    draw();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    const sc = scrollRef.current!;
    const rect = sc.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const tAt = (sc.scrollLeft + mx) / zoom;
    const nz = Math.max(2, Math.min(600, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    useStore.setState({ zoom: nz });
    requestAnimationFrame(() => { sc.scrollLeft = tAt * nz - mx; });
  };
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const prevent = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    sc.addEventListener('wheel', prevent, { passive: false });
    return () => sc.removeEventListener('wheel', prevent);
  }, []);

  // ---------- helpers ----------
  const posFromEvent = (e: { clientX: number; clientY: number }) => {
    const sc = scrollRef.current!;
    const rect = sc.getBoundingClientRect();
    return { x: e.clientX - rect.left + sc.scrollLeft, y: e.clientY - rect.top + sc.scrollTop };
  };
  const trackAtY = (y: number) => {
    const i = Math.floor((y - layout.tracksY) / TRACK_H);
    return tracksTop[i]?.id ?? null;
  };

  const makeSnapper = (exclude: Set<string>) => {
    const p = useStore.getState().project!;
    const pts: number[] = [0, p.duration, playback.time, ...p.markers.map((m) => m.t)];
    for (const c of p.clips) if (!exclude.has(c.id)) pts.push(c.start, c.end);
    const step = gridStep(p, zoom);
    const thr = 8 / zoom;
    return (t: number, enabled: boolean) => {
      if (!enabled) return t;
      let best = t, bd = thr;
      for (const x of pts) { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; } }
      if (bd < thr) return best;
      const g = Math.round((t - p.beatOffset) / step) * step + p.beatOffset;
      return Math.abs(g - t) < thr * 1.5 ? g : t;
    };
  };

  const startDrag = (onMove: (dx: number, dy: number, e: MouseEvent) => void, onUp?: (moved: boolean) => void) => {
    const sc = scrollRef.current!;
    let startX = -1, startY = -1, startSL = sc.scrollLeft, startST = sc.scrollTop, moved = false;
    const move = (e: MouseEvent) => {
      if (startX < 0) { startX = e.clientX; startY = e.clientY; }
      const dx = e.clientX - startX + sc.scrollLeft - startSL, dy = e.clientY - startY + sc.scrollTop - startST;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      onMove(dx, dy, e);
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); onUp?.(moved); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return (e: MouseEvent) => { startX = e.clientX; startY = e.clientY; };
  };

  // ---------- ruler and scrub ----------
  const onRulerDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const seekTo = (ev: { clientX: number; clientY: number }) => playback.seek(Math.max(0, posFromEvent(ev).x / zoom));
    seekTo(e);
    const move = (ev: MouseEvent) => seekTo(ev);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  // ---------- clips ----------
  // drag the round handles on a clip's top corners to set its fades
  const onFadeDown = (e: React.MouseEvent, clip: Clip, which: 'in' | 'out') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const st = useStore.getState();
    const orig = which === 'in' ? clip.fadeIn : clip.fadeOut;
    let cp = false;
    const init = startDrag((dx) => {
      if (!cp) { st.checkpoint(); cp = true; }
      const len = clip.end - clip.start;
      const v = Math.max(0, Math.min(len, orig + (which === 'in' ? dx : -dx) / zoom));
      st.update((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) { if (which === 'in') c.fadeIn = Math.round(v * 100) / 100; else c.fadeOut = Math.round(v * 100) / 100; } }, false);
    });
    init(e.nativeEvent);
  };

  const onClipDown = (e: React.MouseEvent, clip: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation();
    setMenu(null);
    if (e.button === 2) {
      if (!(selection?.kind === 'clip' && selection.ids.includes(clip.id))) useStore.getState().select({ kind: 'clip', ids: [clip.id] });
      setMenu({ x: e.clientX, y: e.clientY, clipId: clip.id });
      return;
    }
    if (e.button !== 0) return;
    const st = useStore.getState();
    let ids = selection?.kind === 'clip' ? selection.ids : [];
    if (e.shiftKey || e.ctrlKey) {
      ids = ids.includes(clip.id) ? ids.filter((x) => x !== clip.id) : [...ids, clip.id];
      st.select({ kind: 'clip', ids });
      return;
    }
    if (!ids.includes(clip.id)) { ids = [clip.id]; st.select({ kind: 'clip', ids }); }
    const p0 = st.project!;
    const orig = new Map(p0.clips.filter((c) => ids.includes(c.id)).map((c) => [c.id, { start: c.start, end: c.end, trackIdx: tracksTop.findIndex((t) => t.id === c.trackId) }]));
    const snapper = makeSnapper(new Set(ids));
    let checkpointed = false;
    const init = startDrag((dx, dy, ev) => {
      if (!checkpointed) { st.checkpoint(); checkpointed = true; }
      const dt = dx / zoom;
      const snapOn = useStore.getState().snap !== ev.altKey;
      const o = orig.get(clip.id)!;
      st.update((p) => {
        if (mode === 'move') {
          // snap using the grabbed clip's start or end, whichever is closer to a snap point
          const s1 = snapper(o.start + dt, snapOn) - o.start;
          const s2 = snapper(o.end + dt, snapOn) - o.end;
          let d = Math.abs(s1 - dt) <= Math.abs(s2 - dt) ? s1 : s2;
          const minStart = Math.min(...[...orig.values()].map((x) => x.start));
          if (minStart + d < 0) d = -minStart;
          const dTrack = Math.round(dy / TRACK_H);
          for (const c of p.clips) {
            const oc = orig.get(c.id); if (!oc) continue;
            c.start = oc.start + d; c.end = oc.end + d;
            const ti = Math.max(0, Math.min(tracksTop.length - 1, oc.trackIdx + dTrack));
            c.trackId = tracksTop[ti].id;
          }
        } else {
          const c = p.clips.find((x) => x.id === clip.id)!;
          if (mode === 'l') c.start = Math.max(0, Math.min(o.end - 0.1, snapper(o.start + dt, snapOn)));
          else c.end = Math.max(o.start + 0.1, snapper(o.end + dt, snapOn));
        }
      }, false);
    });
    init(e.nativeEvent);
  };

  // ---------- empty area: seek or box select ----------
  const onTracksDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setMenu(null);
    const pos = posFromEvent(e);
    if (pos.y < layout.tracksY) return;
    const st = useStore.getState();
    const init = startDrag((dx, dy) => {
      setBox({ x0: pos.x, y0: pos.y, x1: pos.x + dx, y1: pos.y + dy });
    }, (moved) => {
      if (!moved) { st.select(null); playback.seek(pos.x / zoom); setBox(null); return; }
      setBox((b) => {
        if (b) {
          const ta = Math.min(b.x0, b.x1) / zoom, tb = Math.max(b.x0, b.x1) / zoom;
          const ya = Math.min(b.y0, b.y1), yb = Math.max(b.y0, b.y1);
          const ids = st.project!.clips.filter((c) => { const y = trackY(c.trackId); return c.end > ta && c.start < tb && y + TRACK_H > ya && y < yb; }).map((c) => c.id);
          st.select(ids.length ? { kind: 'clip', ids } : null);
        }
        return null;
      });
    });
    init(e.nativeEvent);
  };

  // ---------- lanes ----------
  const onLaneDown = (e: React.MouseEvent, lane: Layout['lanes'][number]) => {
    const pos = posFromEvent(e);
    const t = Math.max(0, pos.x / zoom);
    const st = useStore.getState();
    const p = st.project!;
    if (lane.kind === 'wave') { onRulerDown(e); return; }
    if (lane.kind === 'hits') {
      const hits = p.hits[lane.id] || [];
      const tol = 5 / zoom;
      let idx = -1, bd = tol;
      const i0 = Math.max(0, lastHitIndex(hits, t - tol));
      for (let i = i0; i < hits.length && hits[i].t <= t + tol; i++) { const d = Math.abs(hits[i].t - t); if (d <= bd) { bd = d; idx = i; } }
      if (e.button === 2) {
        if (idx >= 0) st.update((pp) => { pp.hits[lane.id].splice(idx, 1); pp.hitsEdited[lane.id] = true; });
        return;
      }
      if (e.button !== 0) return;
      if (idx < 0) {
        st.update((pp) => { const arr = pp.hits[lane.id] || (pp.hits[lane.id] = []); arr.push({ t, s: 1 }); arr.sort((a, b) => a.t - b.t); pp.hitsEdited[lane.id] = true; });
        return;
      }
      const ot = hits[idx].t;
      let ci = idx; let cp = false;
      const init = startDrag((dx) => {
        if (!cp) { st.checkpoint(); cp = true; }
        st.update((pp) => {
          const arr = pp.hits[lane.id];
          const h = arr[ci]; h.t = Math.max(0, ot + dx / zoom);
          arr.sort((a, b) => a.t - b.t); ci = arr.indexOf(h); pp.hitsEdited[lane.id] = true;
        }, false);
      });
      init(e.nativeEvent);
      return;
    }
    if (lane.kind === 'colour' && e.button === 0 && e.detail === 2) {
      const id = uid();
      st.update((pp) => { pp.paletteKeys.push({ id, t, paletteId: pp.basePaletteId, fade: 2 }); pp.paletteKeys.sort((a, b) => a.t - b.t); });
      st.select({ kind: 'paletteKey', id });
    }
  };

  const dragTimed = (e: React.MouseEvent, sel: { kind: 'marker' | 'paletteKey' | 'pad'; id: string }, get: (p: Project) => { t: number; set: (t: number) => void } | undefined) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const st = useStore.getState();
    st.select(sel as never);
    const orig = get(st.project!)!.t;
    const snapper = makeSnapper(new Set());
    let cp = false;
    const init = startDrag((dx, _dy, ev) => {
      if (!cp) { st.checkpoint(); cp = true; }
      const snapOn = useStore.getState().snap !== ev.altKey;
      st.update((p) => { get(p)?.set(Math.max(0, snapper(orig + dx / zoom, snapOn))); }, false);
    });
    init(e.nativeEvent);
  };

  // ---------- drop from library ----------
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTrack(null);
    const raw = e.dataTransfer.getData('application/x-skimo');
    if (!raw) return;
    const data = JSON.parse(raw);
    const pos = posFromEvent(e);
    const st = useStore.getState();
    let trackId = trackAtY(pos.y);
    const snapper = makeSnapper(new Set());
    const t = Math.max(0, snapper(pos.x / zoom, st.snap));
    const p = st.project!;
    const end = Math.min(p.duration, t + defaultLength(p));
    if (data.transition) {
      // transitions go on the join between two clips that touch on the same track
      if (!trackId) { st.showToast('Drop transitions on the join between two clips on the same track'); return; }
      const onTrack = p.clips.filter((c) => c.trackId === trackId);
      let best: { next: Clip; d: number } | null = null;
      for (const next of onTrack) {
        const prev = onTrack.find((c) => c !== next && Math.abs(c.end - next.start) < 0.05);
        if (!prev) continue;
        const d = Math.abs(next.start * zoom - pos.x);
        if (d < 60 && (!best || d < best.d)) best = { next, d };
      }
      if (!best) { st.showToast('Drop transitions on the join between two clips on the same track. The clips need to touch.'); return; }
      const nextId = best.next.id;
      st.update((pp) => { const c = pp.clips.find((x) => x.id === nextId); if (c) c.transitionIn = { type: data.transition, duration: Math.max(0.25, Math.min(1.5, 60 / pp.bpm * 2)) }; });
      st.select({ kind: 'transition', id: nextId });
      return;
    }
    let extra: Partial<Clip> = {};
    let type = data.type;
    if (data.preset) { const pr = await presetById(data.preset); if (!pr) return; extra = structuredClone(pr.clip); type = pr.clip.type; }
    if (data.mediaIds) extra.mediaIds = data.mediaIds;
    if (data.text) { extra.text = data.text; extra.font = data.font; extra.name = String(data.text).split('\n')[0].slice(0, 30); }
    if (data.mediaIds?.length === 1) extra.name = p.media.find((m) => m.id === data.mediaIds[0])?.name;
    let id = '';
    st.update((pp) => {
      if (!trackId) trackId = addTrack(pp).id;
      const c = makeClip(type, trackId, t, Math.max(t + 0.5, end), extra);
      pp.clips.push(c); id = c.id;
    });
    st.select({ kind: 'clip', ids: [id] });
  };

  // ---------- tracks ----------
  const moveTrack = (id: string, dir: number) => useStore.getState().update((p) => {
    const i = p.tracks.findIndex((t) => t.id === id);
    const j = i + dir;
    if (j < 0 || j >= p.tracks.length) return;
    [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]];
  });

  const selIds = selection?.kind === 'clip' ? selection.ids : [];
  const visT0 = scrollLeft / zoom - 5, visT1 = (scrollLeft + viewW) / zoom + 5;

  return (
    <div className="timeline" style={{ height }} onContextMenu={(e) => e.preventDefault()}>
      <div className="tl-resize" onMouseDown={(e) => {
        const y0 = e.clientY, h0 = height;
        const move = (ev: MouseEvent) => setHeight(Math.max(160, Math.min(window.innerHeight - 250, h0 - (ev.clientY - y0))));
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      }} />
      <div className="tl-toolbar">
        <button className="small" onClick={splitAtPlayhead} title="Split at playhead (Ctrl+B)">✂ Split</button>
        <button className="small" disabled={!selection} onClick={deleteSelection} title="Delete (Del)">🗑 Delete</button>
        <button className="small" onClick={() => useStore.getState().update((p) => { addTrack(p); })}>+ Track</button>
        <button className={'small' + (snap ? ' active' : '')} onClick={() => useStore.setState({ snap: !snap })} title="Snap to beats, markers and other clips (hold Alt to override)">Snap</button>
        <div className="spacer" />
        <span className="tiny muted">Ctrl + scroll to zoom</span>
        <button className="small ghost" onClick={() => useStore.setState({ zoom: Math.max(2, zoom / 1.5) })}>−</button>
        <input type="range" min={2} max={400} value={zoom} onChange={(e) => useStore.setState({ zoom: Number(e.target.value) })} style={{ width: 120 }} />
        <button className="small ghost" onClick={() => useStore.setState({ zoom: Math.min(600, zoom * 1.5) })}>+</button>
        <button className="small" onClick={() => { const sc = scrollRef.current!; useStore.setState({ zoom: Math.max(2, (sc.clientWidth - 40) / project.duration) }); sc.scrollLeft = 0; }}>Fit</button>
      </div>
      <div className="tl-body">
        <div className="tl-heads" ref={headsRef}>
          <div style={{ height: layout.total, position: 'relative' }}>
            <div style={{ height: RULER_H, borderBottom: '1px solid var(--line)' }} className="tl-head tiny muted">Bars / time</div>
            {layout.lanes.map((l) => (
              <div key={l.id} className="tl-head tiny" style={{ position: 'absolute', top: l.y, height: l.h, left: 0, right: 0 }} title={l.kind === 'hits' ? 'Click the lane to add a hit, drag to move, right click to remove' : l.kind === 'colour' ? 'Double click to add a colour change' : ''}>
                {l.lane && <span style={{ width: 7, height: 7, borderRadius: 4, background: l.lane.colour }} />}
                <span className="tname muted">{l.label}</span>
              </div>
            ))}
            {tracksTop.map((t, i) => (
              <div key={t.id} className="tl-head" style={{ position: 'absolute', top: layout.tracksY + i * TRACK_H, height: TRACK_H, left: 0, right: 0 }}>
                {renaming === t.id
                  ? <input className="tname" autoFocus defaultValue={t.name} onBlur={(e) => { const v = e.target.value; useStore.getState().update((p) => { const x = p.tracks.find((y) => y.id === t.id); if (x) x.name = v || x.name; }); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  : <span className="tname" onDoubleClick={() => setRenaming(t.id)} title="Double click to rename">{t.name}</span>}
                <button className={'iconbtn' + (t.hidden ? '' : ' on')} title={t.hidden ? 'Show' : 'Hide'} onClick={() => useStore.getState().update((p) => { const x = p.tracks.find((y) => y.id === t.id)!; x.hidden = !x.hidden; })}>{t.hidden ? '◌' : '●'}</button>
                <button className="iconbtn" title="Move up (draws on top)" onClick={() => moveTrack(t.id, 1)}>↑</button>
                <button className="iconbtn" title="Move down" onClick={() => moveTrack(t.id, -1)}>↓</button>
                <button className="iconbtn" title="Delete track" onClick={() => {
                  const n = project.clips.filter((c) => c.trackId === t.id).length;
                  if (n && !confirm(`Delete this track and its ${n} clip${n > 1 ? 's' : ''}?`)) return;
                  useStore.getState().update((p) => { p.tracks = p.tracks.filter((x) => x.id !== t.id); p.clips = p.clips.filter((c) => c.trackId !== t.id); });
                }}>×</button>
              </div>
            ))}
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef} onScroll={onScroll} onWheel={onWheel}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-skimo')) { e.preventDefault(); setDropTrack(trackAtY(posFromEvent(e).y) ?? 'new'); } }}
          onDragLeave={() => setDropTrack(null)} onDrop={onDrop}>
          <div className="tl-content" style={{ width, height: layout.total }} onMouseDown={onTracksDown}>
            <canvas ref={canvasRef} className="lane-canvas" style={{ top: 0 }} />
            <div className="ruler" style={{ height: RULER_H, width, position: 'sticky', top: 0 }} onMouseDown={(e) => { e.stopPropagation(); onRulerDown(e); }}>
              <canvas ref={rulerRef} className="lane-canvas" style={{ top: 0 }} />
              {project.markers.map((m) => (
                <div key={m.id} className="marker" style={{ left: m.t * zoom, background: m.colour, outline: selection?.kind === 'marker' && selection.id === m.id ? '2px solid #fff' : undefined }}
                  onMouseDown={(e) => dragTimed(e, { kind: 'marker', id: m.id }, (p) => { const x = p.markers.find((y) => y.id === m.id); return x && { t: x.t, set: (t) => { x.t = t; } }; })}>
                  {m.name}
                </div>
              ))}
            </div>
            {project.markers.map((m) => <div key={m.id} className="marker-line" style={{ left: m.t * zoom, background: m.colour }} />)}
            {layout.lanes.map((l) => (
              <div key={l.id} style={{ position: 'absolute', top: l.y, height: l.h, left: 0, width, cursor: l.kind === 'hits' ? 'crosshair' : 'default' }}
                onMouseDown={(e) => { e.stopPropagation(); onLaneDown(e, l); }}>
                {l.kind === 'colour' && project.paletteKeys.map((k) => {
                  const pal = findPalette(k.paletteId, project.palettes);
                  return (
                    <div key={k.id} className={'palkey' + (selection?.kind === 'paletteKey' && selection.id === k.id ? ' sel' : '')} style={{ left: k.t * zoom - 1 }} title={`${pal.name}, fades over ${k.fade} beats`}
                      onMouseDown={(e) => dragTimed(e, { kind: 'paletteKey', id: k.id }, (p) => { const x = p.paletteKeys.find((y) => y.id === k.id); return x && { t: x.t, set: (t) => { x.t = t; p.paletteKeys.sort((a, b) => a.t - b.t); } }; })}>
                      {pal.colours.map((c, i) => <div key={i} style={{ background: c }} />)}
                    </div>
                  );
                })}
                {l.kind === 'colour' && !project.paletteKeys.length && <span className="tiny dim" style={{ position: 'absolute', left: scrollLeft + 6, top: 4 }}>{findPalette(project.basePaletteId, project.palettes).name}{project.paletteCycle.enabled ? ' (cycling)' : ''}. Double click to add a colour change.</span>}
                {l.kind === 'perform' && project.pads.filter((ev) => ev.end > visT0 && ev.start < visT1).map((ev) => (
                  <div key={ev.id} className={'padev' + (selection?.kind === 'pad' && selection.id === ev.id ? ' sel' : '')} style={{ left: ev.start * zoom, width: Math.max(4, (ev.end - ev.start) * zoom) }} title={PAD_MAP.get(ev.pad)?.label}
                    onMouseDown={(e) => {
                      if (e.button === 2) { e.stopPropagation(); useStore.getState().update((p) => { p.pads = p.pads.filter((x) => x.id !== ev.id); }); return; }
                      dragTimed(e, { kind: 'pad', id: ev.id }, (p) => { const x = p.pads.find((y) => y.id === ev.id); return x && { t: x.start, set: (t) => { const len = x.end - x.start; x.start = t; x.end = t + len; } }; });
                    }}>
                    {PAD_MAP.get(ev.pad)?.label}
                  </div>
                ))}
              </div>
            ))}
            {dropTrack && dropTrack !== 'new' && <div className="droptarget" style={{ position: 'absolute', left: 0, width, top: trackY(dropTrack), height: TRACK_H, pointerEvents: 'none' }} />}
            {project.clips.filter((c) => c.end > visT0 && c.start < visT1).map((c) => {
              const def = getDef(c.type);
              const y = trackY(c.trackId);
              if (y < layout.tracksY) return null;
              const hidden = project.tracks.find((t) => t.id === c.trackId)?.hidden;
              const wpx = Math.max(6, (c.end - c.start) * zoom);
              const mods = Object.values(c.mods).map((m) => m.source).filter((v, i, a) => a.indexOf(v) === i);
              const sub = c.type === 'media' ? `${c.mediaIds?.length || 0} image${c.mediaIds?.length === 1 ? '' : 's'}` : c.type === 'text' ? (c.text || '').split('\n')[0] : def.name === c.name ? '' : def.name;
              return (
                <div key={c.id} className={`clip ${def.category}${selIds.includes(c.id) ? ' sel' : ''}${hidden ? ' hiddentrack' : ''}`}
                  style={{ left: c.start * zoom, width: wpx, top: y + 3, height: TRACK_H - 6 }}
                  onMouseDown={(e) => onClipDown(e, c, 'move')}
                  onDoubleClick={(e) => { e.stopPropagation(); playback.seek(c.start); }}>
                  <FadeRamps w={wpx} h={TRACK_H - 6} fi={Math.min(wpx, c.fadeIn * zoom)} fo={Math.min(wpx, c.fadeOut * zoom)} />
                  <div className="fadehandle" title={`Fade in ${c.fadeIn.toFixed(2)}s. Drag to change.`} style={{ left: Math.min(wpx - 10, c.fadeIn * zoom) - 1 }} onMouseDown={(e) => onFadeDown(e, c, 'in')} />
                  <div className="fadehandle" title={`Fade out ${c.fadeOut.toFixed(2)}s. Drag to change.`} style={{ left: Math.max(0, wpx - c.fadeOut * zoom) - 11 }} onMouseDown={(e) => onFadeDown(e, c, 'out')} />
                  {wpx > 30 && <div className="cname">{c.name}</div>}
                  {wpx > 30 && <div className="csub">{[sub, mods.length ? `🔗 ${mods.join(', ')}` : ''].filter(Boolean).join(' · ')}{Object.keys(c.keys).length ? ' · ◆' : ''}</div>}
                  <div className="handle l" onMouseDown={(e) => onClipDown(e, c, 'l')} />
                  <div className="handle r" onMouseDown={(e) => onClipDown(e, c, 'r')} />
                </div>
              );
            })}
            {project.clips.filter((c) => c.transitionIn && c.start > visT0 && c.start < visT1).map((c) => {
              const prev = project.clips.find((x) => x !== c && x.trackId === c.trackId && Math.abs(x.end - c.start) < 0.05);
              if (!prev) return null;
              const d = c.transitionIn!.duration;
              const wpx = Math.max(16, d * zoom);
              const sel = selection?.kind === 'transition' && selection.id === c.id;
              return (
                <div key={'tr' + c.id} className={'transbadge' + (sel ? ' sel' : '')} title={`${TRANSITION_MAP.get(c.transitionIn!.type)?.name ?? 'Transition'} (${d.toFixed(2)}s). Click to edit, right click to remove.`}
                  style={{ left: c.start * zoom - wpx / 2, width: wpx, top: trackY(c.trackId) + TRACK_H / 2 - 10 }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 2) { useStore.getState().update((p) => { const x = p.clips.find((y) => y.id === c.id); if (x) x.transitionIn = null; }); return; }
                    useStore.getState().select({ kind: 'transition', id: c.id });
                  }}>⧓</div>
              );
            })}
            {!project.clips.length && project.audio.length > 0 && (
              <div className="hint" style={{ position: 'absolute', top: layout.tracksY + 10, left: scrollLeft + 20, pointerEvents: 'none' }}>
                Drag visuals, images or effects here from the left, or press ✨ Generate for me at the top.
              </div>
            )}
            {box && <div className="selbox" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
            <div className="playhead" ref={playheadRef} style={{ left: 0, transform: `translateX(${playback.time * zoom}px)` }} />
          </div>
        </div>
      </div>
      {menu && (
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 50, background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', minWidth: 160 }}
          onMouseLeave={() => setMenu(null)}>
          <button className="ghost" style={{ textAlign: 'left' }} onClick={() => { splitAtPlayhead(); setMenu(null); }}>Split at playhead</button>
          <button className="ghost" style={{ textAlign: 'left' }} onClick={() => {
            const st = useStore.getState(); const sel = st.selection?.kind === 'clip' ? st.selection.ids : [];
            st.update((p) => { for (const c of p.clips.filter((x) => sel.includes(x.id))) p.clips.push({ ...structuredClone(c), id: uid(), start: c.end, end: c.end + (c.end - c.start) }); });
            setMenu(null);
          }}>Duplicate</button>
          <button className="ghost" style={{ textAlign: 'left' }} onClick={() => {
            const st = useStore.getState(); const c = st.project!.clips.find((x) => x.id === menu.clipId);
            if (c) st.update((p) => { const x = p.clips.find((y) => y.id === c.id)!; x.start = 0; x.end = p.duration; });
            setMenu(null);
          }}>Stretch to whole song</button>
          <button className="ghost" style={{ textAlign: 'left' }} onClick={() => { deleteSelection(); setMenu(null); }}>Delete</button>
        </div>
      )}
    </div>
  );
}
