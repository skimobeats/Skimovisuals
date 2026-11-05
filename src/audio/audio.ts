import type { AnalysisResult } from './analysis.worker';
import { SPEC_BANDS } from './analysis.worker';
import type { AudioRef, Hit, Project } from '../types';
import { platform } from '../platform';

export { SPEC_BANDS };
export type { AnalysisResult };

// ---------- Decoding and analysis ----------

export const buffers = new Map<string, AudioBuffer>();
export const analyses = new Map<string, AnalysisResult>(); // keyed by audio id, plus 'mix'

let ctx: AudioContext | null = null;
export function audioContext() {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

export async function decodeAudio(path: string): Promise<AudioBuffer> {
  const data = await platform.readBinary(path);
  return await audioContext().decodeAudioData(data.slice(0));
}

function monoMix(bufs: AudioBuffer[]): { samples: Float32Array; sampleRate: number } {
  const sampleRate = bufs[0].sampleRate;
  const len = Math.max(...bufs.map((b) => b.length));
  const out = new Float32Array(len);
  for (const b of bufs) {
    const chans = b.numberOfChannels;
    for (let c = 0; c < chans; c++) {
      const d = b.getChannelData(c);
      const g = 1 / chans;
      for (let i = 0; i < d.length; i++) out[i] += d[i] * g;
    }
  }
  return { samples: out, sampleRate };
}

export function analyseSamples(samples: Float32Array, sampleRate: number, onProgress?: (p: number) => void): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.progress !== undefined) onProgress?.(e.data.progress);
      if (e.data.result) { resolve(e.data.result); worker.terminate(); }
    };
    worker.onerror = (err) => { reject(err); worker.terminate(); };
    worker.postMessage({ samples, sampleRate }, [samples.buffer]);
  });
}

/** Load and analyse every audio file in the project. Calls back with progress 0..1. */
export async function loadProjectAudio(project: Project, onProgress: (msg: string, p: number) => void) {
  const refs = project.audio;
  if (refs.length === 0) return;
  let done = 0;
  const total = refs.length * 2 + (refs.length > 1 ? 1 : 0);
  for (const r of refs) {
    if (!buffers.has(r.id)) {
      onProgress(`Loading ${r.name}`, done / total);
      buffers.set(r.id, await decodeAudio(r.path));
    }
    done++;
  }
  const jobs: Promise<void>[] = [];
  for (const r of refs) {
    if (analyses.has(r.id)) { done++; continue; }
    const b = buffers.get(r.id)!;
    const { samples, sampleRate } = monoMix([b]);
    jobs.push(analyseSamples(samples, sampleRate).then((res) => { analyses.set(r.id, res); done++; onProgress(`Analysing ${r.name}`, done / total); }));
  }
  onProgress('Analysing audio', done / total);
  await Promise.all(jobs);
  if (refs.length > 1) {
    const { samples, sampleRate } = monoMix(refs.map((r) => buffers.get(r.id)!));
    analyses.set('mix', await analyseSamples(samples, sampleRate));
  } else {
    analyses.set('mix', analyses.get(refs[0].id)!);
  }
  onProgress('Done', 1);
}

export function clearAudio() {
  stop();
  buffers.clear();
  analyses.clear();
}

export function audioDuration(project: Project) {
  let d = 0;
  for (const r of project.audio) { const b = buffers.get(r.id); if (b) d = Math.max(d, b.duration); }
  return d;
}

// ---------- Hit lanes ----------

export interface LaneDef { id: string; label: string; colour: string; analysisId: string; flux: keyof AnalysisResult; minGap: number; }

function stemByRole(project: Project, ...roles: string[]): AudioRef | undefined {
  for (const role of roles) { const s = project.audio.find((a) => a.role === role); if (s) return s; }
  return undefined;
}

export function laneDefs(project: Project): LaneDef[] {
  const lanes: LaneDef[] = [];
  if (project.audioMode === 'master' || project.audio.length <= 1) {
    const id = project.audio[0]?.id ?? 'mix';
    lanes.push({ id: 'kick', label: 'Kick', colour: '#ff6b8b', analysisId: id, flux: 'fluxKick', minGap: 0.1 });
    lanes.push({ id: 'snare', label: 'Snare / Clap', colour: '#ffd36b', analysisId: id, flux: 'fluxSnare', minGap: 0.12 });
    lanes.push({ id: 'hats', label: 'Hats', colour: '#6bdcff', analysisId: id, flux: 'fluxHats', minGap: 0.06 });
    return lanes;
  }
  const kick = stemByRole(project, 'kick');
  const snare = stemByRole(project, 'snare');
  const hats = stemByRole(project, 'hats');
  const drums = stemByRole(project, 'drums');
  lanes.push(kick
    ? { id: 'kick', label: 'Kick', colour: '#ff6b8b', analysisId: kick.id, flux: 'fluxOnset', minGap: 0.1 }
    : { id: 'kick', label: 'Kick', colour: '#ff6b8b', analysisId: drums?.id ?? 'mix', flux: 'fluxKick', minGap: 0.1 });
  lanes.push(snare
    ? { id: 'snare', label: 'Snare / Clap', colour: '#ffd36b', analysisId: snare.id, flux: 'fluxOnset', minGap: 0.12 }
    : { id: 'snare', label: 'Snare / Clap', colour: '#ffd36b', analysisId: drums?.id ?? 'mix', flux: 'fluxSnare', minGap: 0.12 });
  lanes.push(hats
    ? { id: 'hats', label: 'Hats', colour: '#6bdcff', analysisId: hats.id, flux: 'fluxOnset', minGap: 0.05 }
    : { id: 'hats', label: 'Hats', colour: '#6bdcff', analysisId: drums?.id ?? 'mix', flux: 'fluxHats', minGap: 0.05 });
  for (const s of project.audio) {
    if (['kick', 'snare', 'hats', 'drums'].includes(s.role)) continue;
    lanes.push({ id: 'stem:' + s.id, label: `${s.name} hits`, colour: '#b98bff', analysisId: s.id, flux: 'fluxOnset', minGap: 0.08 });
  }
  return lanes;
}

export function pickPeaks(flux: Float32Array, rate: number, sensitivity: number, minGap: number): Hit[] {
  const hits: Hit[] = [];
  const w = Math.round(rate * 0.25);
  const delta = 0.55 - sensitivity * 0.5;      // sensitivity 0..1
  const mult = 1.5 - sensitivity * 0.6;
  let lastT = -10;
  // running mean via prefix sums
  const pre = new Float64Array(flux.length + 1);
  for (let i = 0; i < flux.length; i++) pre[i + 1] = pre[i] + flux[i];
  for (let i = 2; i < flux.length - 2; i++) {
    const v = flux[i];
    if (v < flux[i - 1] || v < flux[i - 2] || v < flux[i + 1] || v < flux[i + 2]) continue;
    const a = Math.max(0, i - w), b = Math.min(flux.length, i + w);
    const mean = (pre[b] - pre[a]) / (b - a);
    if (v < mean * mult + delta) continue;
    const t = i / rate;
    if (t - lastT < minGap) {
      if (hits.length && v > hits[hits.length - 1].s) hits[hits.length - 1] = { t, s: Math.min(1, v) }, lastT = t;
      continue;
    }
    hits.push({ t, s: Math.min(1, v) });
    lastT = t;
  }
  return hits;
}

export function detectLane(project: Project, lane: LaneDef): Hit[] {
  const a = analyses.get(lane.analysisId) || analyses.get('mix');
  if (!a) return [];
  const sens = project.detection[lane.id]?.sensitivity ?? 0.5;
  return pickPeaks(a[lane.flux] as Float32Array, a.rate, sens, lane.minGap);
}

/** Rough tempo guess from the onset curve, used by the Detect button. */
export function estimateBpm(): number | null {
  const a = analyses.get('mix');
  if (!a) return null;
  const f = new Float32Array(a.frames);
  for (let i = 0; i < a.frames; i++) f[i] = a.fluxKick[i] + a.fluxSnare[i] * 0.7 + a.fluxOnset[i] * 0.5;
  let best = 0, bestBpm = 120;
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (60 / bpm) * a.rate;
    let s = 0;
    for (let i = 0; i + lag * 4 < f.length; i += 2) {
      const l1 = Math.round(i + lag), l2 = Math.round(i + lag * 2), l4 = Math.round(i + lag * 4);
      s += f[i] * (f[l1] + f[l2] * 0.8 + f[l4] * 0.6);
    }
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    s *= prior;
    if (s > best) { best = s; bestBpm = bpm; }
  }
  return Math.round(bestBpm * 2) / 2;
}

/** Find the beat offset (in seconds, 0..one beat) that best lines the grid up with kicks. */
export function estimateOffset(bpm: number, hits: Hit[]): number {
  if (!hits.length) return 0;
  const beat = 60 / bpm;
  let best = 0, bestScore = -1;
  for (let k = 0; k < 100; k++) {
    const off = (k / 100) * beat;
    let s = 0;
    for (const h of hits) {
      const ph = ((h.t - off) / beat) % 1;
      const d = Math.min(ph, 1 - ph);
      s += h.s * Math.exp(-d * d * 200);
    }
    if (s > bestScore) { bestScore = s; best = off; }
  }
  return best;
}

// ---------- Playback ----------

let playing: { sources: AudioBufferSourceNode[]; ctxStart: number; offset: number } | null = null;
let pausedAt = 0;
let soloId: string | null = null;

export function isPlaying() { return !!playing; }

export function play(project: Project, from: number) {
  stop();
  const c = audioContext();
  if (c.state === 'suspended') c.resume();
  const sources: AudioBufferSourceNode[] = [];
  const when = c.currentTime + 0.05;
  for (const r of project.audio) {
    const b = buffers.get(r.id);
    if (!b) continue;
    const audible = soloId ? soloId === r.id : !r.muted;
    if (!audible) continue;
    const src = c.createBufferSource();
    src.buffer = b;
    const g = c.createGain();
    g.gain.value = r.volume;
    src.connect(g).connect(c.destination);
    if (from < b.duration) src.start(when, Math.max(0, from));
    sources.push(src);
  }
  playing = { sources, ctxStart: when, offset: from };
}

export function stop() {
  if (playing) {
    pausedAt = currentTime();
    for (const s of playing.sources) { try { s.stop(); } catch { /* ignore */ } }
    playing = null;
  }
}

export function setSolo(id: string | null) { soloId = id; }
export function getSolo() { return soloId; }

export function currentTime(): number {
  if (!playing || !ctx) return pausedAt;
  const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  return Math.max(playing.offset, playing.offset + (ctx.currentTime - playing.ctxStart) - lat);
}

export function setPausedTime(t: number) { pausedAt = t; }
