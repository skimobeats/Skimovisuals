// "Generate for me": builds a full set of layers that follow the track's structure.
import type { Clip, Marker, Project } from './types';
import { makeClip, uid } from './store';
import { getDef } from './engine/registry';
import { analyses } from './audio/audio';
import { PASTEL_IDS, PRESET_PALETTES, SKIMO_IDS } from './palettes';
import { mod } from './engine/layers/types';

export interface GenerateOptions {
  style: string;
  colours: 'skimo' | 'pastel' | 'style' | 'any';
  logo: boolean;
  intensity: number;   // 0..1
  useMedia: boolean;
  title: string;
  seed: number;
}

interface Style {
  id: string; name: string; description: string;
  backgrounds: string[]; overlays: string[]; always: string[]; peak: string[]; finish: string[];
  palettes: string[]; mediaTransitions: number[]; mediaLook: Partial<Record<string, number>>;
}

export const STYLES: Style[] = [
  { id: 'skimo', name: 'Skimo', description: 'Your logo front and centre over dark, glowing, reactive visuals. The signature look.',
    backgrounds: ['gradient', 'fractal', 'tunnel', 'particles', 'contours'], overlays: ['particles', 'lasers', 'shapes'], always: ['bloom', 'film'], peak: ['shake', 'rgbsplit', 'kaleido'], finish: [],
    palettes: SKIMO_IDS, mediaTransitions: [1, 2, 3], mediaLook: { paletteMap: 0.3 } },
  { id: 'pastel', name: 'Pastel Dream', description: 'Soft, floaty and warm. Ideal for lofi and chilled tracks.',
    backgrounds: ['gradient', 'liquid', 'contours'], overlays: ['particles', 'dots', 'shapes'], always: ['film'], peak: ['feedback', 'warp'], finish: ['bloom'],
    palettes: PASTEL_IDS, mediaTransitions: [1, 0, 3], mediaLook: { warp: 0.15, paletteMap: 0.25 } },
  { id: 'minimal', name: 'Minimal Light', description: 'Clean bars and grids of light. Architectural and precise.',
    backgrounds: ['lightgrid', 'shapes', 'dots'], overlays: ['lightgrid', 'lasers'], always: ['bloom'], peak: ['flash', 'led'], finish: [],
    palettes: ['mono-white', 'ice', 'pastel-dream', 'mono-red', 'cyber-blue'], mediaTransitions: [6, 5], mediaLook: { paletteMap: 0.6, contrast: 1.3 } },
  { id: 'rave', name: 'Rave Tunnel', description: 'Tunnels, lasers and kaleidoscopes. Big energy for DnB and breaks.',
    backgrounds: ['tunnel', 'fractal', 'shapes'], overlays: ['lasers', 'particles', 'spectrum'], always: ['bloom'], peak: ['kaleido', 'shake', 'flash'], finish: ['rgbsplit'],
    palettes: ['neon-rave', 'vaporwave', 'deep-space', 'acid', 'cyber-blue', 'pastel-dream'], mediaTransitions: [3, 2], mediaLook: { pulse: 0.2 } },
  { id: 'glitch', name: 'Glitch Club', description: 'Broken, corrupted and aggressive. Great for trap and heavy drops.',
    backgrounds: ['dots', 'lightgrid', 'contours'], overlays: ['spectrum', 'shapes'], always: ['glitch'], peak: ['datamosh', 'rgbsplit', 'shake'], finish: ['posterise'],
    palettes: ['acid', 'toxic', 'mono-red', 'neon-rave', 'inferno'], mediaTransitions: [2, 5, 6], mediaLook: { glitch: 0.2, rgbSplit: 0.2 } },
  { id: 'retro', name: 'Retro Tape', description: 'Neon grids, sunsets and worn VHS tape.',
    backgrounds: ['retrogrid', 'gradient'], overlays: ['particles', 'spectrum'], always: ['vhs'], peak: ['shake', 'feedback'], finish: ['bloom'],
    palettes: ['vaporwave', 'retro-vhs', 'lofi-sunset', 'golden-hour'], mediaTransitions: [4, 0, 2], mediaLook: { saturation: 1.2 } },
  { id: 'cosmic', name: 'Cosmic Fractal', description: 'Deep space fractals, star fields and trails.',
    backgrounds: ['fractal', 'particles', 'liquid'], overlays: ['particles', 'shapes'], always: ['bloom'], peak: ['kaleido', 'feedback', 'zoomblur'], finish: [],
    palettes: ['deep-space', 'lavender-haze', 'cyber-blue', 'vaporwave', 'ice'], mediaTransitions: [1, 3], mediaLook: { keyDark: 0.2 } },
  { id: 'liquid', name: 'Liquid Flow', description: 'Melting, flowing shapes that breathe with the bass.',
    backgrounds: ['liquid', 'contours', 'gradient'], overlays: ['shapes', 'dots'], always: ['warp'], peak: ['feedback', 'kaleido'], finish: ['bloom'],
    palettes: ['seafoam', 'mint-lilac', 'cotton-candy', 'forest-dusk', 'sorbet'], mediaTransitions: [1], mediaLook: { warp: 0.3, melt: 0.15 } },
  { id: 'surprise', name: 'Surprise Me', description: 'A random mix of everything.',
    backgrounds: [], overlays: [], always: [], peak: [], finish: [], palettes: [], mediaTransitions: [0, 1, 2, 3, 4, 5], mediaLook: {} }
];

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface Section { start: number; end: number; energy: number; name: string; }

/** Split the song into sections from the user's markers, or from the energy of each phrase */
export function findSections(project: Project): Section[] {
  const dur = project.duration;
  const mix = analyses.get('mix');
  const energyBetween = (a: number, b: number) => {
    if (!mix) return 0.5;
    const i0 = Math.max(0, Math.floor(a * mix.rate)), i1 = Math.min(mix.frames, Math.ceil(b * mix.rate));
    let s = 0; for (let i = i0; i < i1; i++) s += mix.level[i] * 0.6 + mix.sub[i] * 0.2 + mix.highs[i] * 0.2;
    return i1 > i0 ? s / (i1 - i0) : 0;
  };
  let bounds: { t: number; name: string }[] = [];
  const markers = [...project.markers].sort((a, b) => a.t - b.t).filter((m) => m.t > 0.5 && m.t < dur - 0.5);
  if (markers.length) {
    bounds = [{ t: 0, name: 'Intro' }, ...markers.map((m) => ({ t: m.t, name: m.name }))];
  } else {
    // use 8 bar phrases, merging neighbours with similar energy
    const barLen = (60 / project.bpm) * project.beatsPerBar;
    const phrase = barLen * 8;
    const start = project.beatOffset;
    bounds.push({ t: 0, name: 'Intro' });
    let last = -1;
    for (let t = start + phrase; t < dur - phrase * 0.5; t += phrase) {
      const e = energyBetween(t, t + phrase);
      const prev = energyBetween(t - phrase, t);
      const level = e > 0.62 ? 2 : e > 0.42 ? 1 : 0;
      if (last === -1) last = prev > 0.62 ? 2 : prev > 0.42 ? 1 : 0;
      if (level !== last) { bounds.push({ t, name: level === 2 ? 'Drop' : level === 1 ? 'Build' : 'Break' }); last = level; }
    }
  }
  const sections: Section[] = bounds.map((b, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1].t : dur;
    return { start: b.t, end, energy: energyBetween(b.t, end), name: b.name };
  });
  // energy relative to the song
  const max = Math.max(...sections.map((s) => s.energy), 0.001);
  const min = Math.min(...sections.map((s) => s.energy));
  for (const s of sections) {
    let e = max - min > 0.05 ? (s.energy - min) / (max - min) : 0.5;
    const n = s.name.toLowerCase();
    if (/drop|chorus|hook|peak/.test(n)) e = Math.max(e, 0.85);
    if (/break|intro|outro|down/.test(n)) e = Math.min(e, 0.35);
    s.energy = e;
  }
  return sections;
}

export function suggestMarkers(project: Project): Marker[] {
  const colours: Record<string, string> = { Drop: '#ff6b8b', Build: '#ffd36b', Break: '#6bdcff', Intro: '#9b8bff' };
  const saved = project.markers;
  const tmp = { ...project, markers: [] };
  const secs = findSections(tmp);
  project.markers = saved;
  return secs.slice(1).map((s) => ({ id: uid(), t: s.start, name: s.name, colour: colours[s.name] || '#ffffff' }));
}

function jitter(clip: Clip, r: () => number, amount: number) {
  const def = getDef(clip.type);
  const skip = new Set(['brightness', 'opacity', 'x', 'y', 'scale', 'speed', 'amount', 'strobe', 'flash', 'pulse', 'boost', 'bounce', 'zoom', 'tint', 'keyDark', 'keyLight', 'transLen', 'change', 'transition', 'order', 'fit', 'mirror']);
  for (const p of def.params) {
    if (skip.has(p.key) || clip.mods[p.key]) continue;
    if (p.type === 'float' && r() < 0.6) {
      const range = (p.max ?? 1) - (p.min ?? 0);
      let v = Number(clip.params[p.key]) + (r() - 0.5) * range * amount;
      if (p.step && p.step >= 1) v = Math.round(v);
      clip.params[p.key] = Math.max(p.min ?? 0, Math.min(p.max ?? 1, v));
    } else if (p.type === 'select' && r() < 0.35 && p.options) {
      clip.params[p.key] = Math.floor(r() * p.options.length);
    }
  }
}

const ALL_GEN = ['lightgrid', 'tunnel', 'liquid', 'fractal', 'particles', 'shapes', 'spectrum', 'gradient', 'retrogrid', 'lasers', 'contours', 'dots'];
const ALL_FX = ['kaleido', 'rgbsplit', 'glitch', 'feedback', 'bloom', 'vhs', 'warp', 'shake', 'flash', 'film', 'edges', 'led', 'pixelate', 'zoomblur', 'datamosh'];

export function generate(project: Project, opts: GenerateOptions) {
  const r = rng(opts.seed * 7919 + 13);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  let style = STYLES.find((s) => s.id === opts.style) || STYLES[0];
  if (style.id === 'surprise') {
    style = {
      ...style,
      backgrounds: [pick(ALL_GEN), pick(ALL_GEN), pick(ALL_GEN)],
      overlays: [pick(ALL_GEN), pick(ALL_GEN)],
      always: [pick(['bloom', 'film', 'vhs', 'warp'])],
      peak: [pick(ALL_FX), pick(ALL_FX)],
      finish: r() < 0.5 ? [pick(['bloom', 'rgbsplit', 'film'])] : [],
      palettes: PRESET_PALETTES.map((p) => p.id)
    };
  }
  const sections = findSections(project);
  const intensity = opts.intensity;

  // palettes
  let palPool = style.palettes;
  if (opts.colours === 'skimo') palPool = SKIMO_IDS;
  else if (opts.colours === 'pastel') palPool = PASTEL_IDS;
  else if (opts.colours === 'any') palPool = PRESET_PALETTES.map((p) => p.id);
  const palA = pick(palPool);
  let palB = pick(palPool); if (palB === palA && palPool.length > 1) palB = palPool[(palPool.indexOf(palA) + 1) % palPool.length];
  project.basePaletteId = palA;
  project.paletteCycle = { ...project.paletteCycle, enabled: false };
  project.paletteKeys = [];

  // fresh tracks
  const T = (name: string) => ({ id: uid(), name, hidden: false, locked: false });
  const tBg = T('Background'), tMedia = T('Images'), tOver = T('Overlay'), tText = T('Text'), tFx1 = T('Effects'), tFx2 = T('Drop effects'), tFin = T('Finish'), tLogo = T('Logo');
  project.tracks = [tBg, tMedia, tOver, tFx1, tFx2, tFin, tLogo, tText];
  project.clips = [];
  const media = opts.useMedia ? project.media.map((m) => m.id) : [];
  const dur = project.duration;

  const scaleMods = (c: Clip, k: number) => { for (const m of Object.values(c.mods)) m.amount *= k; };

  sections.forEach((s, i) => {
    const e = s.energy;
    const k = 0.5 + intensity * 0.8;
    // palette change at each new section
    if (i > 0) project.paletteKeys.push({ id: uid(), t: s.start, paletteId: e > 0.6 ? palB : palA, fade: e > 0.6 ? 0.5 : 4 });

    // background
    const bgType = style.backgrounds[i % style.backgrounds.length] || pick(ALL_GEN);
    const bg = makeClip(bgType, tBg.id, s.start, s.end, { blend: 'normal' });
    jitter(bg, r, 0.3);
    scaleMods(bg, k * (0.6 + e * 0.6));
    if (bg.params.speed !== undefined) bg.params.speed = 0.5 + e * 0.9 * (0.6 + intensity * 0.6);
    project.clips.push(bg);

    // media
    if (media.length) {
      const mc = makeClip('media', tMedia.id, s.start, s.end, { mediaIds: [...media] });
      mc.params.transition = pick(style.mediaTransitions);
      mc.params.change = e > 0.6 ? (intensity > 0.6 ? 2 : 3) : 4;
      mc.params.order = r() < 0.4 ? 1 : 0;
      for (const [key, v] of Object.entries(style.mediaLook)) mc.params[key] = v as number;
      if (e > 0.6) { mc.mods.rgbSplit = mod('snare', 0.25 * k); mc.params.shatter = 0; }
      if (e < 0.35) { mc.params.warp = Math.max(Number(mc.params.warp), 0.1); mc.opacity = 0.85; }
      // mix images with the visuals underneath rather than covering them
      const look = r();
      if (look < 0.3) { mc.blend = 'screen'; mc.opacity = 0.9; }
      else if (look < 0.5) { mc.blend = 'overlay'; mc.opacity = 1; }
      else if (look < 0.7) { mc.params.fit = 1; mc.params.scale = 0.75; mc.params.keyDark = 0.15; mc.opacity = 0.95; }
      else if (look < 0.85) { mc.params.mirror = 4; mc.params.segments = 6 + Math.floor(r() * 4); mc.blend = 'screen'; }
      else { mc.blend = 'normal'; mc.opacity = 0.75; }
      scaleMods(mc, k);
      project.clips.push(mc);
    }

    // overlay for busier sections
    if (e > 0.4 || intensity > 0.75) {
      const ov = makeClip(pick(style.overlays.length ? style.overlays : ALL_GEN), tOver.id, s.start, s.end, { blend: 'screen' });
      jitter(ov, r, 0.3);
      scaleMods(ov, k);
      ov.opacity = 0.6 + e * 0.4;
      project.clips.push(ov);
    }

    // drop effects
    if (e > 0.6 && style.peak.length) {
      const fx = makeClip(pick(style.peak), tFx2.id, s.start, s.end);
      jitter(fx, r, 0.2);
      scaleMods(fx, k);
      project.clips.push(fx);
    }
  });

  // whole song effects
  for (const id of style.always) {
    const fx = makeClip(id, tFx1.id, 0, dur);
    project.clips.push(fx);
  }
  for (const id of style.finish) {
    const fx = makeClip(id, tFin.id, 0, dur);
    if (id === 'rgbsplit') fx.mods.amount = mod('kick', 0.3 * (0.5 + intensity), 0.15);
    project.clips.push(fx);
  }
  // a gentle kick flash in the loudest sections when going wild
  if (intensity > 0.85) {
    for (const s of sections) if (s.energy > 0.75) {
      const fl = makeClip('flash', tFin.id, s.start, s.end, { opacity: 0.3 });
      fl.params.colour = 'p2';
      if (!project.clips.some((c) => c.trackId === tFin.id && c.start < s.end && c.end > s.start)) project.clips.push(fl);
    }
  }

  // titles
  if (opts.title.trim()) {
    const first = sections[0];
    const len = Math.min(first.end - first.start, (60 / project.bpm) * project.beatsPerBar * 8, 16);
    const t1 = makeClip('text', tText.id, first.start + 0.5, first.start + Math.max(4, len), { text: opts.title.trim(), fadeIn: 1, fadeOut: 1.5, font: 'Archivo Variable', upper: true, wide: true, letterSpacing: 0.05 });
    Object.assign(t1.params, { colour: '#ffffff', tint: 1, scale: 0.5, y: opts.logo ? -0.78 : 0 });
    t1.mods.glitch = mod('snare', 0.3, 0.15);
    project.clips.push(t1);
    const last = sections[sections.length - 1];
    const t2 = makeClip('text', tText.id, Math.max(t1.end + 1, dur - 8), dur, { text: opts.title.trim(), fadeIn: 1, fadeOut: 3, font: t1.font, upper: true, wide: true, letterSpacing: 0.05 });
    Object.assign(t2.params, t1.params);
    if (t2.end - t2.start > 2 && last) project.clips.push(t2);
  }

  // the Skimo logo sits on top most of the time, dropping out briefly before big moments
  if (opts.logo) {
    const barLen = (60 / project.bpm) * project.beatsPerBar;
    let prevLogo: Clip | null = null;
    sections.forEach((s, i) => {
      const next = sections[i + 1];
      let end = s.end;
      // let the visuals take over for the last two bars before a drop
      if (next && next.energy > 0.6 && s.energy < next.energy && s.end - s.start > barLen * 6) end = s.end - barLen * 2;
      const lc = makeClip('logo', tLogo.id, s.start, end, { name: 'Skimo Logo' });
      const e = s.energy;
      for (const m of Object.values(lc.mods)) m.amount *= 0.6 + intensity * 0.5 + e * 0.4;
      if (e > 0.7) { lc.mods.glitch = mod('snare', 0.45 + intensity * 0.35, 0.15); if (intensity > 0.8) lc.mods.shatter = mod('section', 0.5, 0.6); lc.params.letterFx = pick([0, 3, 5]); }
      else if (e < 0.35) { lc.params.melt = 0.1; lc.params.morphShape = 3; lc.mods.morph = mod('bass', 0.35, 0.4); lc.params.letterFx = pick([0, 1, 4]); }
      else lc.params.letterFx = pick([0, 1, 3]);
      lc.params.colour = pick(['p0', 'p0', 'p1']);
      lc.params.scale = 0.75 + r() * 0.2;
      if (prevLogo && Math.abs(prevLogo.end - lc.start) < 0.05) lc.transitionIn = { type: e > 0.6 ? pick(['glitch', 'flash', 'skimo']) : pick(['skimo', 'fade', 'liquid']), duration: (60 / project.bpm) * (e > 0.6 ? 1 : 2) };
      if (i === 0) lc.fadeIn = Math.min(3, (lc.end - lc.start) / 3);
      project.clips.push(lc);
      prevLogo = lc;
    });
    // colours react to the music too
    project.colourReact = intensity > 0.6
      ? { hueSource: 'bass', hueAmount: 0.04, swapOn: 'snare', brightSource: 'kick', brightAmount: 0.15 }
      : { hueSource: 'barwave', hueAmount: 0.04, swapOn: 'section', brightSource: 'kick', brightAmount: 0.15 };
  }

  // join neighbouring clips on the same track with transitions rather than hard cuts
  for (const track of [tBg.id, tMedia.id, tOver.id]) {
    const onTrack = project.clips.filter((c) => c.trackId === track).sort((a, b) => a.start - b.start);
    for (let i = 1; i < onTrack.length; i++) {
      const c = onTrack[i];
      if (Math.abs(onTrack[i - 1].end - c.start) > 0.05 || c.transitionIn) continue;
      const energyUp = (sections.find((s) => Math.abs(s.start - c.start) < 0.05)?.energy ?? 0.5) > 0.6;
      c.transitionIn = { type: energyUp ? pick(['flash', 'zoom', 'glitch', 'skimo']) : pick(['fade', 'liquid', 'dipblack', 'fade']), duration: (60 / project.bpm) * (energyUp ? 1 : 4) };
    }
  }

  // fade from and to black
  const firstBg = project.clips.find((c) => c.trackId === tBg.id);
  if (firstBg) firstBg.fadeIn = Math.min(2, (firstBg.end - firstBg.start) / 3);
  const lastBg = [...project.clips].reverse().find((c) => c.trackId === tBg.id);
  if (lastBg) lastBg.fadeOut = Math.min(3, (lastBg.end - lastBg.start) / 3);

  // drop empty tracks except background
  project.tracks = project.tracks.filter((t) => t === tBg || project.clips.some((c) => c.trackId === t.id));
  project.generateSeed = opts.seed;
}
