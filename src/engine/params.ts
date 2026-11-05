import type { Clip, Keyframe, Project } from '../types';
import type { LayerDef, ParamDef } from './layers/types';
import { sampleSource, beatInfo, lastHitIndex } from '../audio/sources';
import { findPalette, hexToRgb } from '../palettes';

export function keyframeValue(keys: Keyframe[], t: number): number {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m].t <= t) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi];
  const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return a.v + (b.v - a.v) * f;
}

export function baseValue(clip: Clip, p: ParamDef, t: number): number {
  const keys = clip.keys[p.key];
  if (keys && keys.length) return keyframeValue(keys, t);
  const v = clip.params[p.key];
  if (v === undefined) return typeof p.def === 'boolean' ? (p.def ? 1 : 0) : Number(p.def);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Number(v);
}

export function evalNumber(project: Project, clip: Clip, p: ParamDef, t: number): number {
  let v = baseValue(clip, p, t);
  const m = clip.mods[p.key];
  if (m && p.type === 'float') {
    const range = (p.max ?? 1) - (p.min ?? 0);
    v += m.amount * range * sampleSource(project, m.source, t, m.decay);
    v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, v));
  }
  return v;
}

// ---------- Colour ----------

export type Rgb = [number, number, number];

function mixRgb(a: Rgb, b: Rgb, f: number): Rgb { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function paletteRgb(project: Project, id: string): Rgb[] {
  return findPalette(id, project.palettes).colours.slice(0, 4).map(hexToRgb).concat([[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]).slice(0, 4) as Rgb[];
}
function mixPal(a: Rgb[], b: Rgb[], f: number): Rgb[] { return a.map((c, i) => mixRgb(c, b[i], f)); }

/** The four palette colours in use at time t */
export function paletteAt(project: Project, t: number, override?: string | null): Rgb[] {
  if (override) return paletteRgb(project, override);
  const { beatLen, beatPos } = beatInfo(project, t);
  const cyc = project.paletteCycle;
  if (cyc.enabled && cyc.paletteIds.length > 1) {
    let count = 0; let since = 0;
    if (cyc.every === 'kick' || cyc.every === 'snare') {
      const hits = project.hits[cyc.every] || [];
      const i = lastHitIndex(hits, t);
      count = i + 1;
      since = i >= 0 ? (t - hits[i].t) / beatLen : 99;
    } else {
      const beats = cyc.every === 'beat' ? 1 : cyc.every === 'bar' ? project.beatsPerBar : parseInt(cyc.every, 10) * project.beatsPerBar;
      const pos = Math.max(0, beatPos) / beats;
      count = Math.floor(pos);
      since = (pos - count) * beats;
    }
    const n = cyc.paletteIds.length;
    const cur = paletteRgb(project, cyc.paletteIds[count % n]);
    const prev = paletteRgb(project, cyc.paletteIds[(count - 1 + n * 1000) % n]);
    const fade = cyc.fade > 0 ? Math.min(1, since / cyc.fade) : 1;
    return count === 0 ? cur : mixPal(prev, cur, fade);
  }
  const keys = project.paletteKeys;
  let current = paletteRgb(project, project.basePaletteId);
  if (!keys.length) return current;
  let prev = current;
  for (const k of keys) {
    if (k.t > t) break;
    prev = current;
    const next = paletteRgb(project, k.paletteId);
    const since = (t - k.t) / beatLen;
    const f = k.fade > 0 ? Math.min(1, since / k.fade) : 1;
    current = f >= 1 ? next : mixPal(prev, next, f);
  }
  return current;
}

export function colourValue(project: Project, clip: Clip, p: ParamDef, pal: Rgb[]): Rgb {
  const v = String(clip.params[p.key] ?? p.def);
  if (/^p[0-3]$/.test(v)) return pal[parseInt(v[1], 10)];
  return hexToRgb(v);
}

// ---------- Integrated clock (so speed changes never cause jumps) ----------

const clocks = new Map<string, { t: number; phase: number }>();

export function resetClocks() { clocks.clear(); }

export function clipClock(project: Project, clip: Clip, def: LayerDef, t: number): number {
  const sp = def.params.find((p) => p.key === 'speed');
  const local = t - clip.start;
  if (!sp) return local;
  const speedAt = (time: number) => evalNumber(project, clip, sp, time);
  const c = clocks.get(clip.id);
  if (c && t >= c.t && t - c.t < 0.5) {
    const phase = c.phase + (t - c.t) * (speedAt(c.t) + speedAt(t)) * 0.5;
    clocks.set(clip.id, { t, phase });
    return phase;
  }
  // recompute from the start of the clip
  const dt = 1 / 60;
  let phase = 0;
  let prev = speedAt(clip.start);
  for (let x = clip.start + dt; x <= t; x += dt) { const s = speedAt(x); phase += (prev + s) * 0.5 * dt; prev = s; }
  clocks.set(clip.id, { t, phase });
  return phase;
}

export function clipOpacity(clip: Clip, t: number): number {
  let a = clip.opacity;
  if (clip.fadeIn > 0) a *= Math.min(1, (t - clip.start) / clip.fadeIn);
  if (clip.fadeOut > 0) a *= Math.min(1, (clip.end - t) / clip.fadeOut);
  return Math.max(0, Math.min(1, a));
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
