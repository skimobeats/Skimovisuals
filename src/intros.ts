// Ready made intros: short sequences of layers that build up to the first big moment of the track.
import type { Clip, Keyframe, Project, Track } from './types';
import { makeClip, uid } from './store';
import { DROP_RE } from './audio/sources';
import { mod } from './engine/layers/types';

export interface IntroDef { id: string; name: string; description: string; }
export const INTROS: IntroDef[] = [
  { id: 'dive', name: 'The Dive', description: 'A glowing pyramid on a dark horizon. The camera rises up its face and plunges inside on the drop, into an endless lattice of light.' },
  { id: 'assembly', name: 'Orb Assembly', description: 'Shards drift in from the dark and lock together a little more on every kick, forming the orb as the drop hits.' },
  { id: 'ignition', name: 'Logo Ignition', description: 'Pitch black. The SKIMO stencil flickers on like a failing neon sign, glitching to the beat, then locks fully lit on the drop.' },
  { id: 'letters', name: 'Through the Letters', description: 'The camera flies at the logo and straight through the I into the visuals of the track.' },
  { id: 'print', name: 'Print Run', description: 'The logo is printed ink by ink, slightly out of line like a screen print, until the artwork is complete on the drop.' }
];

export type IntroEnd = { kind: 'drop' } | { kind: 'marker'; markerId: string } | { kind: 'bars'; bars: number };
export interface IntroOptions { end: IntroEnd; title: boolean; }

const PREFIX = 'Intro: ';
export const isIntroClip = (c: Clip) => c.name.startsWith(PREFIX);

export function introEndTime(p: Project, end: IntroEnd): number {
  const bar = (60 / p.bpm) * p.beatsPerBar;
  const fallback = p.beatOffset + bar * 8;
  let t = fallback;
  if (end.kind === 'drop') {
    const ms = [...p.markers].sort((a, b) => a.t - b.t);
    t = (ms.find((m) => DROP_RE.test(m.name)) || ms[0])?.t ?? fallback;
  } else if (end.kind === 'marker') {
    t = p.markers.find((m) => m.id === end.markerId)?.t ?? fallback;
  } else t = p.beatOffset + bar * end.bars;
  return Math.max(bar, Math.min(p.duration - 0.5, t));
}

const keys = (pts: [number, number][]): Keyframe[] => pts.map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);

/** Remove any intro already in the project */
export function removeIntro(p: Project) {
  p.clips = p.clips.filter((c) => !isIntroClip(c));
  p.tracks = p.tracks.filter((t) => !t.name.startsWith('Intro') || p.clips.some((c) => c.trackId === t.id));
}

export function applyIntro(p: Project, id: string, opts: IntroOptions) {
  removeIntro(p);
  const E = introEndTime(p, opts.end);
  const beat = 60 / p.bpm, bar = beat * p.beatsPerBar;
  const kicks = (p.hits.kick || []).filter((h) => h.t < E && h.s > 0.3).map((h) => h.t);
  const track = (name: string): Track => { const t = { id: uid(), name, hidden: false, locked: false }; p.tracks.push(t); return t; };
  const add = (type: string, tr: Track, start: number, end: number, extra: Partial<Clip> = {}) => {
    const c = makeClip(type, tr.id, start, Math.min(p.duration, end), extra);
    c.name = PREFIX + (extra.name || c.name);
    p.clips.push(c);
    return c;
  };
  const hasLogoAfter = p.clips.some((c) => c.type === 'logo' && c.end > E + 0.1 && !isIntroClip(c));
  const t1 = track('Intro'), t2 = track('Intro top');

  if (id === 'dive') {
    const lat = add('lattice', t1, 0, E + bar * 4, { name: 'Pyramid dive', blend: 'normal', fadeOut: bar * 2 });
    lat.keys.dive = keys([[0, 0], [E * 0.5, 0.45], [E * 0.82, 0.8], [Math.max(0, E - beat), 0.93], [E, 1]]);
    lat.keys.speed = keys([[0, 0.4], [E - 0.05, 0.5], [E, 1.4], [E + bar * 4, 1]]);
    lat.mods = { ...lat.mods, pulse: mod('kick', 0.9, 0.5) };
    if (!hasLogoAfter) add('logo', t2, E, E + bar * 8, { name: 'Logo', fadeOut: bar });
  }

  if (id === 'assembly') {
    const bg = add('gradient', t1, 0, E + bar, { name: 'Darkness', blend: 'normal', fadeOut: bar });
    bg.params.depth = 0.85;
    const orb = add('hero', t1, 0, E + bar, { name: 'Orb assembling', blend: 'normal', fadeOut: bar });
    orb.params.shape = 0; orb.params.debris = 0;
    orb.trackId = t2.id;
    // the shards gather a step closer on every kick, locking together on the drop
    const n = Math.max(1, kicks.length);
    const pts: [number, number][] = [[0, 1]];
    kicks.forEach((k, i) => { pts.push([k - 0.01, 1 - i / n]); pts.push([k + 0.12, 1 - (i + 1) / n]); });
    pts.push([E, 0]);
    orb.keys.burst = keys(pts);
    orb.keys.core = keys([[0, 0.1], [E - 0.05, 0.3], [E, 1.4], [E + beat * 2, 0.4]]);
    if (!hasLogoAfter) add('logo', track('Intro logo'), E, E + bar * 8, { name: 'Logo', fadeOut: bar });
  }

  if (id === 'ignition') {
    const black = add('solid', t1, 0, E, { name: 'Black', blend: 'normal' });
    black.params.colourA = '#000000'; black.params.mode = 0;
    const logo = add('logo', t2, 0, hasLogoAfter ? E : E + bar * 8, { name: 'Logo ignition' });
    // flickers like a failing neon sign: rare at first, then more often, locking on at the drop
    const pts: [number, number][] = [[0, 0]];
    let tt = beat;
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    while (tt < E - beat * 0.5) {
      const prog = tt / E;
      if (rnd() < 0.25 + prog * 0.6) {
        const on = 0.3 + prog * 0.7;
        pts.push([tt - 0.005, 0], [tt, on], [tt + 0.06 + rnd() * 0.12, on * (0.4 + rnd() * 0.6)], [tt + 0.2 + rnd() * 0.2, prog > 0.8 ? on * 0.6 : 0]);
      }
      tt += beat / (prog > 0.6 ? 2 : 1);
    }
    pts.push([E - 0.02, 0.2], [E, 1]);
    logo.keys.visibility = keys(pts);
    logo.keys.glitch = keys([[0, 0.6], [E - 0.05, 0.35], [E, 0], [E + beat, 0]]);
    logo.mods = { ...logo.mods, glitch: mod('snare', 0.4, 0.15) };
    logo.params.shadow = 0;
  }

  if (id === 'letters') {
    const logo = add('logo', t2, 0, E, { name: 'Logo fly through' });
    // fly at the I, faster and faster, and straight through it on the drop
    const start = Math.max(0, E - bar * 2);
    const z: [number, number][] = [[0, 1], [start, 1]];
    for (let i = 1; i <= 20; i++) { const k = i / 20; z.push([start + (E - start) * k, Math.pow(80, Math.pow(k, 1.8))]); }
    logo.keys.zoom = keys(z);
    logo.params.zoomLetter = 2;
    logo.keys.visibility = keys([[0, 1], [Math.max(0, E - 0.18), 1], [E, 0]]);
    logo.params.letterFx = 1;
    if (!p.clips.some((c) => !isIntroClip(c) && c.start < E && c.type !== 'logo')) {
      const bg = add('gradient', t1, 0, E + bar, { name: 'Colour behind', blend: 'normal', fadeOut: bar });
      bg.params.flare = 0.5;
    }
  }

  if (id === 'print') {
    const paper = add('solid', t1, 0, E, { name: 'Paper', blend: 'normal' });
    paper.params.mode = 3; paper.params.colourA = 'p3'; paper.params.colourB = 'p2'; paper.params.brightness = 0.6;
    const film = add('film', t2, 0, E + bar, { name: 'Print texture', fadeOut: bar });
    film.params.grain = 0.8; film.params.vignette = 0.5;
    const logo = add('logo', track('Intro logo'), 0, hasLogoAfter ? E : E + bar * 8, { name: 'Logo print run' });
    // ink goes down bar by bar, lining up as it goes
    const bars = Math.max(2, Math.round(E / bar));
    const vis: [number, number][] = [[0, 0]];
    const slip: [number, number][] = [[0, 1]];
    for (let i = 0; i < bars; i++) {
      const tt = (E * i) / bars;
      vis.push([tt + 0.01, (i + 1) / bars]);
      slip.push([tt + 0.01, 1 - i / bars]);
    }
    vis.push([E, 1]); slip.push([E - 0.02, 0.2], [E, 0]);
    logo.keys.visibility = keys(vis);
    logo.keys.slip = keys(slip);
    logo.keys.texture = keys([[0, 0.9], [E, 0.35]]);
    logo.params.letterFx = 3;
  }

  if (opts.title) {
    const tt = track('Intro title');
    const t = add('text', tt, Math.min(bar, E * 0.15), Math.max(bar, E - beat), { name: 'Title', text: `SKIMO:${p.name && p.name !== 'Untitled' ? p.name : 'TRACK NAME'}`, upper: true, wide: true, letterSpacing: 0.05, font: 'Archivo Variable', fadeIn: beat * 2, fadeOut: beat });
    Object.assign(t.params, { colour: '#ffffff', tint: 1, scale: 0.5, y: -0.78 });
  }
  // tidy away any intro tracks that ended up empty
  p.tracks = p.tracks.filter((tr) => !tr.name.startsWith('Intro') || p.clips.some((c) => c.trackId === tr.id));
  return E;
}

/** Saved intros keep their clips with times relative to where the intro ended */
export interface SavedIntro { id: string; name: string; end: number; tracks: Track[]; clips: Clip[]; }

export function introFromProject(p: Project, name: string): SavedIntro | null {
  const clips = p.clips.filter(isIntroClip);
  if (!clips.length) return null;
  const end = Math.max(...clips.map((c) => c.end));
  const trackIds = new Set(clips.map((c) => c.trackId));
  return { id: uid(), name, end, tracks: structuredClone(p.tracks.filter((t) => trackIds.has(t.id))), clips: structuredClone(clips) };
}

export function applySavedIntro(p: Project, saved: SavedIntro, opts: IntroOptions) {
  removeIntro(p);
  const E = introEndTime(p, opts.end);
  const oldE = saved.clips.reduce((m, c) => Math.max(m, c.start < saved.end ? Math.min(c.end, saved.end) : 0), 0) || saved.end;
  const k = E / Math.max(0.1, oldE);
  const idMap = new Map<string, string>();
  for (const t of saved.tracks) { const nt = { ...t, id: uid() }; idMap.set(t.id, nt.id); p.tracks.push(nt); }
  for (const c of saved.clips) {
    const nc: Clip = structuredClone(c);
    nc.id = uid(); nc.trackId = idMap.get(c.trackId)!;
    nc.start = c.start * k; nc.end = Math.min(p.duration, c.end * k);
    for (const key of Object.keys(nc.keys)) nc.keys[key] = nc.keys[key].map((x) => ({ t: x.t * k, v: x.v }));
    p.clips.push(nc);
  }
  return E;
}
