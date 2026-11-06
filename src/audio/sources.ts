import type { Hit, Project } from '../types';
import { analyses, laneDefs, SPEC_BANDS } from './audio';

export interface SourceInfo { id: string; label: string; group: string; kind: 'env' | 'hits' | 'beat'; }

export function listSources(project: Project): SourceInfo[] {
  const out: SourceInfo[] = [];
  for (const l of laneDefs(project)) out.push({ id: l.id, label: l.label, group: 'Hits', kind: 'hits' });
  out.push(
    { id: 'level', label: 'Overall level', group: 'Levels', kind: 'env' },
    { id: 'sub', label: 'Sub', group: 'Levels', kind: 'env' },
    { id: 'bass', label: 'Bass', group: 'Levels', kind: 'env' },
    { id: 'mids', label: 'Mids', group: 'Levels', kind: 'env' },
    { id: 'highs', label: 'Highs', group: 'Levels', kind: 'env' },
    { id: 'air', label: 'Air (very high)', group: 'Levels', kind: 'env' }
  );
  if (project.audioMode === 'stems' && project.audio.length > 1) {
    for (const s of project.audio) out.push({ id: `stemlevel:${s.id}`, label: `${s.name} level`, group: 'Stems', kind: 'env' });
  }
  out.push(
    { id: 'beat', label: 'Every beat (pulse)', group: 'Tempo', kind: 'beat' },
    { id: 'bar', label: 'Every bar (pulse)', group: 'Tempo', kind: 'beat' },
    { id: 'beatramp', label: 'Beat ramp', group: 'Tempo', kind: 'beat' },
    { id: 'barramp', label: 'Bar ramp', group: 'Tempo', kind: 'beat' },
    { id: 'beatwave', label: 'Beat wave (smooth)', group: 'Tempo', kind: 'beat' },
    { id: 'barwave', label: 'Bar wave (smooth)', group: 'Tempo', kind: 'beat' },
    { id: 'section', label: 'New section (pulse)', group: 'Sections', kind: 'hits' },
    { id: 'sectionramp', label: 'Builds across each section', group: 'Sections', kind: 'env' }
  );
  return out;
}

function envAt(arr: Float32Array | undefined, rate: number, t: number) {
  if (!arr || arr.length === 0) return 0;
  const x = t * rate;
  const i = Math.floor(x);
  if (i < 0) return arr[0];
  if (i >= arr.length - 1) return arr[arr.length - 1];
  const f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

/** Index of last hit at or before t */
export function lastHitIndex(hits: Hit[], t: number) {
  let lo = 0, hi = hits.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function hitValue(hits: Hit[] | undefined, t: number, decay: number) {
  if (!hits || !hits.length) return 0;
  const i = lastHitIndex(hits, t);
  if (i < 0) return 0;
  const h = hits[i];
  const dt = t - h.t;
  const d = Math.max(0.01, decay);
  // short 8ms attack avoids single frame pops
  const att = Math.min(1, dt / 0.008);
  let v = h.s * att * Math.exp(-dt / d);
  if (att < 1 && i > 0) v = Math.max(v, hits[i - 1].s * Math.exp(-(t - hits[i - 1].t) / d));
  return Math.min(1, v);
}

export function beatInfo(project: Project, t: number) {
  const beatLen = 60 / Math.max(1, project.bpm);
  const beatPos = (t - project.beatOffset) / beatLen;
  const barPos = beatPos / project.beatsPerBar;
  return { beatLen, beatPos, barPos };
}

export function sampleSource(project: Project, id: string, t: number, decay = 0.25): number {
  const mix = analyses.get('mix');
  switch (id) {
    case 'level': case 'sub': case 'bass': case 'mids': case 'highs': case 'air':
      return mix ? envAt(mix[id], mix.rate, t) : 0;
    case 'beat': case 'bar': case 'beatramp': case 'barramp': case 'beatwave': case 'barwave': {
      const { beatLen, beatPos, barPos } = beatInfo(project, t);
      if (id === 'beat') { const ph = beatPos - Math.floor(beatPos); return beatPos < 0 ? 0 : Math.exp(-(ph * beatLen) / Math.max(0.01, decay)); }
      if (id === 'bar') { const ph = barPos - Math.floor(barPos); return barPos < 0 ? 0 : Math.exp(-(ph * beatLen * project.beatsPerBar) / Math.max(0.01, decay)); }
      if (id === 'beatramp') return beatPos - Math.floor(beatPos);
      if (id === 'barramp') return barPos - Math.floor(barPos);
      if (id === 'beatwave') return 0.5 - 0.5 * Math.cos(beatPos * Math.PI * 2);
      return 0.5 - 0.5 * Math.cos(barPos * Math.PI * 2);
    }
  }
  if (id === 'section' || id === 'sectionramp') {
    const ms = project.markers;
    let prev = 0, next = project.duration;
    for (const m of ms) { if (m.t <= t && m.t > prev) prev = m.t; if (m.t > t && m.t < next) next = m.t; }
    if (id === 'sectionramp') return Math.max(0, Math.min(1, (t - prev) / Math.max(0.1, next - prev)));
    if (!ms.some((m) => m.t <= t)) return 0;
    return Math.exp(-(t - prev) / Math.max(0.05, decay));
  }
  if (id.startsWith('stemlevel:')) {
    const a = analyses.get(id.slice(10));
    return a ? envAt(a.level, a.rate, t) : 0;
  }
  // hit lanes
  return hitValue(project.hits[id], t, decay);
}

/** How many times an event has happened up to time t, and seconds since the last one */
export function eventCount(project: Project, on: string, t: number, from = 0): { count: number; since: number } {
  if (!on) return { count: 0, since: 99 };
  if (on === 'beat' || on === 'bar') {
    const { beatLen, beatPos } = beatInfo(project, t);
    const per = on === 'bar' ? project.beatsPerBar : 1;
    const pos = beatPos / per;
    const startPos = beatInfo(project, from).beatPos / per;
    const count = Math.max(0, Math.floor(pos) - Math.floor(startPos));
    return { count, since: (pos - Math.floor(pos)) * per * beatLen };
  }
  if (on === 'section') {
    const ms = project.markers.filter((m) => m.t > from && m.t <= t).sort((a, b) => a.t - b.t);
    return { count: ms.length, since: ms.length ? t - ms[ms.length - 1].t : 99 };
  }
  const hits = project.hits[on] || [];
  const i = lastHitIndex(hits, t);
  const i0 = lastHitIndex(hits, from);
  return { count: Math.max(0, i - i0), since: i >= 0 ? t - hits[i].t : 99 };
}

/** Spectrum (SPEC_BANDS values) at time t from the main mix */
export function spectrumAt(t: number, out: Float32Array) {
  const a = analyses.get('mix');
  if (!a) { out.fill(0); return out; }
  const f = Math.max(0, Math.min(a.frames - 1, Math.round(t * a.rate)));
  for (let b = 0; b < SPEC_BANDS; b++) out[b] = a.spectrum[f * SPEC_BANDS + b];
  return out;
}
