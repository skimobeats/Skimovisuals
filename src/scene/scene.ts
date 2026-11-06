// Depth and lighting information for background scene photos, worked out once and cached.
import type { MediaItem } from '../types';
import { platform, joinPath } from '../platform';
import { hashString } from '../engine/params';

export type Rgb = [number, number, number];
export interface SceneData { depth: Uint8Array; w: number; h: number; key: Rgb; ambient: Rgb; }
export type SceneStatus = { state: 'working' | 'ready' | 'error'; message?: string };

const SIZE = 518; // the model works on 518 x 518 pictures
const ready = new Map<string, SceneData>();
const pending = new Map<string, Promise<SceneData>>();
const status = new Map<string, SceneStatus>();
const listeners = new Set<() => void>();
let worker: Worker | null = null;
let modelSent = false;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: { depth: Uint8Array; w: number; h: number }) => void; reject: (e: Error) => void }>();
export let depthProvider = '';

function emit() { for (const l of listeners) l(); }
export function onSceneChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function sceneStatus(id: string) { return status.get(id); }
export function sceneNow(id: string) { return ready.get(id); }

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./depth.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else { depthProvider = e.data.provider; w.resolve(e.data); }
    };
  }
  return worker;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = () => rej(new Error('Could not open the image')); img.src = url; });
}

async function runModel(img: HTMLImageElement) {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const input = new Float32Array(3 * SIZE * SIZE);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < SIZE * SIZE; i++) for (let ch = 0; ch < 3; ch++) input[ch * SIZE * SIZE + i] = (px[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  let model: ArrayBuffer | undefined;
  if (!modelSent) { model = await platform.readBinary(await platform.modelPath()); modelSent = true; }
  const id = nextId++;
  return new Promise<{ depth: Uint8Array; w: number; h: number }>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    getWorker().postMessage({ id, model, input, size: SIZE }, model ? [model, input.buffer] : [input.buffer]);
  });
}

function lighting(img: HTMLImageElement): { key: Rgb; ambient: Rgb } {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 48, 48);
  const d = ctx.getImageData(0, 0, 48, 48).data;
  const px: { l: number; c: Rgb }[] = [];
  for (let i = 0; i < d.length; i += 4) { const col: Rgb = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; px.push({ l: col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11, c: col }); }
  px.sort((a, b) => b.l - a.l);
  const avg = (arr: { c: Rgb }[]): Rgb => { const s: Rgb = [0, 0, 0]; for (const p of arr) { s[0] += p.c[0]; s[1] += p.c[1]; s[2] += p.c[2]; } return [s[0] / arr.length, s[1] / arr.length, s[2] / arr.length]; };
  return { key: avg(px.slice(0, Math.max(1, Math.floor(px.length * 0.08)))), ambient: avg(px) };
}

async function cachePath(item: MediaItem) {
  const st = await platform.stat(item.path);
  const { userData } = await platform.paths();
  const key = Math.floor(hashString(item.path) * 1e9).toString(36) + '-' + (st ? `${st.size}-${Math.floor(st.mtime)}` : '0');
  return joinPath(joinPath(userData, 'depth-cache'), 'v2-' + key + '.bin');
}

/** Depth and lighting for a photo. Cached in memory and on disk, so each photo is only analysed once. */
export function sceneData(item: MediaItem): Promise<SceneData> {
  const have = ready.get(item.id);
  if (have) return Promise.resolve(have);
  const p = pending.get(item.id);
  if (p) return p;
  status.set(item.id, { state: 'working' });
  emit();
  const job = (async () => {
    const img = await loadImage(platform.mediaUrl(item.path));
    const light = lighting(img);
    let depth: Uint8Array | null = null, w = SIZE, h = SIZE;
    const file = await cachePath(item).catch(() => null);
    if (file && await platform.exists(file)) {
      const buf = new Uint8Array(await platform.readBinary(file));
      w = buf[0] | (buf[1] << 8); h = buf[2] | (buf[3] << 8);
      if (buf.length === 4 + w * h) depth = buf.slice(4);
    }
    if (!depth) {
      const res = await runModel(img);
      depth = res.depth; w = res.w; h = res.h;
      if (file) {
        const out = new Uint8Array(4 + w * h);
        out[0] = w & 255; out[1] = w >> 8; out[2] = h & 255; out[3] = h >> 8;
        out.set(depth, 4);
        platform.writeBinary(file, out).catch(() => {});
      }
    }
    const data: SceneData = { depth, w, h, ...light };
    ready.set(item.id, data);
    status.set(item.id, { state: 'ready' });
    emit();
    return data;
  })().catch((e) => {
    pending.delete(item.id);
    status.set(item.id, { state: 'error', message: String(e?.message || e) });
    emit();
    throw e;
  });
  pending.set(item.id, job);
  return job;
}

/** Nearness at a point on a straight scale (apparent size grows with this) */
export function nearnessAt(s: SceneData, u: number, v: number) { const d = depthAt(s, u, v); return d * d; }

/** Stored depth at a point, 0 far to 1 near (square root scale, used for comparisons). u, v are 0..1 with v going down the picture. */
export function depthAt(s: SceneData, u: number, v: number) {
  const x = Math.max(0, Math.min(s.w - 1, Math.round(u * (s.w - 1))));
  const y = Math.max(0, Math.min(s.h - 1, Math.round(v * (s.h - 1))));
  let sum = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = Math.max(0, Math.min(s.w - 1, x + dx)), yy = Math.max(0, Math.min(s.h - 1, y + dy));
    sum += s.depth[yy * s.w + xx]; n++;
  }
  return sum / n / 255;
}
