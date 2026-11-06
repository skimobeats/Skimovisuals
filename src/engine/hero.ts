// 3D hero shapes: faceted objects made of shards that push out, tumble and burst with the music.
import type { Clip, Project } from '../types';
import type { LayerDef } from './layers/types';
import { f, sel, col, mod } from './layers/types';
import { evalNumber, colourValue, Rgb, clipSpin } from './params';
import { eventCount, lastHitIndex } from '../audio/sources';

export const HERO_SHAPES = ['Orb', 'Crystal', 'Monolith', 'Ring', 'Shard cloud', 'Liquid blob', 'Logo slab'];

export const HERO_LAYER: LayerDef = {
  id: 'hero', name: '3D Hero', category: 'hero', tags: ['3d', 'hero'],
  description: 'A 3D object made of shards that push out to the kick, snare and hats, breathes with the bass and bursts apart on drops.',
  params: [
    sel('shape', 'Shape', HERO_SHAPES, 0, { group: 'Shape' }),
    sel('detail', 'Shards', ['Chunky', 'Medium', 'Fine'], 1, { group: 'Shape' }),
    f('size', 'Size', 0.2, 2.5, 1, { group: 'Shape' }),
    f('thickness', 'Shard depth', 0.02, 0.6, 0.22, { group: 'Shape' }),
    f('gap', 'Gaps between shards', 0, 1, 0.08, { group: 'Shape' }),
    f('variation', 'Variation', 0, 50, 1, { step: 1, group: 'Shape' }),
    f('x', 'Position X', -1, 1, 0, { group: 'Shape' }),
    f('y', 'Position Y', -1, 1, 0, { group: 'Shape' }),
    f('spin', 'Spin', -2, 2, 0.25, { group: 'Motion' }),
    f('tilt', 'Tilt', -1, 1, 0.25, { group: 'Motion' }),
    f('wobble', 'Wobble', 0, 1, 0.3, { group: 'Motion' }),
    f('reach', 'How far shards reach', 0, 2.5, 1, { group: 'Music' }),
    f('kick', 'Big chunks (kick)', 0, 1, 0, { group: 'Music' }),
    f('snare', 'Scatter (snare)', 0, 1, 0, { group: 'Music' }),
    f('hats', 'Tiny spikes (hats)', 0, 1, 0, { group: 'Music' }),
    f('ripple', 'Ripple (melody)', 0, 1, 0, { group: 'Music' }),
    f('breathe', 'Breathe (bass)', 0, 1, 0, { group: 'Music' }),
    f('burst', 'Burst apart', 0, 1, 0, { group: 'Music' }),
    f('debris', 'Flying debris on kicks', 0, 1, 0.5, { group: 'Music' }),
    sel('material', 'Material', ['Matte', 'Glossy', 'Glass', 'Wireframe'], 1, { group: 'Look' }),
    sel('colourMode', 'Colouring', ['Dark with colour accents', 'Palette colours', 'Single colour'], 0, { group: 'Look' }),
    col('colour', 'Single colour', 'p0', { group: 'Look' }),
    col('warm', 'Warm light', 'p1', { group: 'Look' }),
    col('cool', 'Cool light', 'p0', { group: 'Look' }),
    f('core', 'Inner glow', 0, 1.5, 0.35, { group: 'Look' }),
    f('floor', 'Floor glow', 0, 1, 0.5, { group: 'Look' }),
    f('brightness', 'Brightness', 0, 3, 1, { group: 'Look' })
  ],
  defaultMods: {
    kick: mod('kick', 0.95, 0.22), snare: mod('snare', 0.85, 0.2), hats: mod('hats', 0.8, 0.09),
    ripple: mod('mids', 0.6, 0.3), breathe: mod('bass', 0.6, 0.3), core: mod('kick', 0.35, 0.2)
  },
  glsl: ''
};

// ---------- geometry ----------
type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => scl(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function icosphere(sub_: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => nrm(v as V3));
  let faces: number[][] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub_; s++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache.has(k)) return cache.get(k)!;
      verts.push(nrm(scl(add(verts[a], verts[b]), 0.5)));
      cache.set(k, verts.length - 1);
      return verts.length - 1;
    };
    const nf: number[][] = [];
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  return { verts, faces };
}

// vertex layout: pos3 centre3 dir3 rand4 bary3 uv2 front1 = 19 floats
const STRIDE = 19;

interface Built { buf: WebGLBuffer; count: number; }

function buildShape(shape: number, detail: number, thickness: number, variation: number): Float32Array {
  const r = rng(1234 + variation * 97 + shape * 13);
  const out: number[] = [];
  const pushShard = (A: V3, B: V3, C: V3, dir: V3, depth: number, uvs?: [number, number][], solidBack = true, backFlag = 0) => {
    const centre = scl(add(add(A, B), C), 1 / 3);
    let n = nrm(cross(sub(B, A), sub(C, A)));
    if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) { const tmp = B; B = C; C = tmp; n = scl(n, -1); }
    const A2 = sub(A, scl(n, depth)), B2 = sub(B, scl(n, depth)), C2 = sub(C, scl(n, depth));
    const rr = r();
    const band = rr < 0.34 ? 0 : rr < 0.66 ? 1 : 2;
    const rand = [r(), band, Math.min(1, len(sub(A, B)) * 2.5), r()];
    const uvA = uvs?.[0] ?? [0, 0], uvB = uvs?.[1] ?? [0, 0], uvC = uvs?.[2] ?? [0, 0];
    const v = (p: V3, bary: V3, uv: [number, number], front: number) => out.push(...p, ...centre, ...dir, ...rand, ...bary, ...uv, front);
    const tri = (a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], front: number) => { v(a, [1, 0, 0], ua, front); v(b, [0, 1, 0], ub, front); v(c, [0, 0, 1], uc, front); };
    tri(A, B, C, uvA, uvB, uvC, 1);
    if (solidBack) tri(A2, C2, B2, uvA, uvC, uvB, backFlag);
    const quad = (a: V3, b: V3, a2: V3, b2: V3) => { tri(a, a2, b2, [0, 0], [0, 0], [0, 0], 0); tri(a, b2, b, [0, 0], [0, 0], [0, 0], 0); };
    quad(A, B, A2, B2); quad(B, C, B2, C2); quad(C, A, C2, A2);
  };

  if (shape === 3) {
    // ring of shards
    const segU = [18, 28, 44][detail], segV = [6, 8, 12][detail];
    const R = 0.8, rt = 0.3;
    const P = (u: number, vv: number): V3 => {
      const a = (u / segU) * Math.PI * 2, b = (vv / segV) * Math.PI * 2;
      const j = 1 + (r() - 0.5) * 0.15;
      return [(R + rt * j * Math.cos(b)) * Math.cos(a), rt * j * Math.sin(b), (R + rt * j * Math.cos(b)) * Math.sin(a)];
    };
    const grid: V3[][] = [];
    for (let u = 0; u <= segU; u++) { grid.push([]); for (let vv = 0; vv <= segV; vv++) grid[u].push(P(u % segU, vv % segV)); }
    for (let u = 0; u < segU; u++) for (let vv = 0; vv < segV; vv++) {
      const a = grid[u][vv], b = grid[u + 1][vv], c = grid[u + 1][vv + 1], d = grid[u][vv + 1];
      const ang = ((u + 0.5) / segU) * Math.PI * 2;
      const ring: V3 = [R * Math.cos(ang), 0, R * Math.sin(ang)];
      const centre = scl(add(add(a, b), add(c, d)), 0.25);
      const dir = nrm(sub(centre, ring));
      pushShard(a, b, c, dir, thickness * 0.6);
      pushShard(a, c, d, dir, thickness * 0.6);
    }
    return new Float32Array(out);
  }
  if (shape === 4) {
    // a cloud of loose shards
    const n = [60, 140, 300][detail];
    for (let i = 0; i < n; i++) {
      const dir = nrm([r() - 0.5, r() - 0.5, r() - 0.5]);
      const rad = 0.35 + Math.pow(r(), 0.6) * 0.75;
      const c = scl(dir, rad);
      const s = (0.08 + r() * 0.16) * (detail === 2 ? 0.7 : 1);
      const t1 = nrm(cross(dir, [0, 1, 0.3])), t2 = nrm(cross(dir, t1));
      const pt = (a: number): V3 => add(c, add(scl(t1, Math.cos(a) * s * (0.6 + r() * 0.8)), scl(t2, Math.sin(a) * s * (0.6 + r() * 0.8))));
      pushShard(pt(0), pt(2.1 + r()), pt(4.2 + r()), dir, s * 0.5);
    }
    return new Float32Array(out);
  }
  if (shape === 6) {
    // the Skimo banner as a thick slab made of tiles, with the letters cut through
    const corners: V3[] = [[-1, 0.4856, 0], [0.7934, 0.2971, 0], [1, -0.4856, 0], [-0.8187, -0.3217, 0]]; // tl tr br bl, logo aspect 2.059
    const cols = [6, 10, 16][detail], rows = [3, 4, 6][detail];
    const lerp3 = (a: V3, b: V3, k: number): V3 => add(a, scl(sub(b, a), k));
    const at = (u: number, vv: number): V3 => lerp3(lerp3(corners[0], corners[1], u), lerp3(corners[3], corners[2], u), vv);
    // texture space follows the banner's bounding box
    const uvOf = (p: V3): [number, number] => [(p[0] + 1) / 2, (p[1] + 0.4856) / 0.9712];
    const depth = Math.max(0.08, thickness * 0.8);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = at(i / cols, j / rows), b = at((i + 1) / cols, j / rows), c = at((i + 1) / cols, (j + 1) / rows), d = at(i / cols, (j + 1) / rows);
      const centre = scl(add(add(a, b), add(c, d)), 0.25);
      const dir = nrm([centre[0] * 0.5, centre[1] * 0.5, 1]);
      pushShard(a, b, c, dir, depth, [uvOf(a), uvOf(b), uvOf(c)], true, 2);
      pushShard(a, c, d, dir, depth, [uvOf(a), uvOf(c), uvOf(d)], true, 2);
    }
    return new Float32Array(out);
  }
  const blob = shape === 5;
  const sphere = icosphere(blob ? [2, 3, 4][detail] : [1, 2, 3][detail]);
  const jit = blob ? 0.02 : [0.22, 0.14, 0.08][detail];
  const verts = sphere.verts.map((v) => {
    let p = scl(v, 1 + (r() - 0.5) * jit);
    p = add(p, scl([r() - 0.5, r() - 0.5, r() - 0.5], jit * 0.4));
    if (shape === 1) { const l1 = Math.abs(p[0]) + Math.abs(p[1]) * 0.8 + Math.abs(p[2]); p = scl(p, 1 / l1); p = [p[0] * 1.05, p[1] * 1.9, p[2] * 1.05]; }
    if (shape === 2) { const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])); p = scl(p, 1 / m); p = [p[0] * 0.62, p[1] * 1.25, p[2] * 0.32]; }
    return p;
  });
  for (const [a, b, c] of sphere.faces) {
    const A = verts[a], B = verts[b], C = verts[c];
    const centre = scl(add(add(A, B), C), 1 / 3);
    pushShard(A, B, C, nrm(centre), blob ? 0.02 : thickness, undefined, !blob);
  }
  return new Float32Array(out);
}

// debris: small tetrahedra thrown out on kicks
function buildDebris(): Float32Array {
  const r = rng(77);
  const out: number[] = [];
  const n = 160;
  for (let i = 0; i < n; i++) {
    const dir = nrm([r() - 0.5, (r() - 0.5) * 0.8, r() - 0.5]);
    const rand = [r(), i % 8, 0.4 + r() * 0.8, r()];
    const s = 0.025 + r() * 0.05;
    const tet: V3[] = [[s, s, s], [-s, -s, s], [-s, s, -s], [s, -s, -s]];
    const faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    for (const fc of faces) for (let k = 0; k < 3; k++) out.push(...tet[fc[k]], 0, 0, 0, ...dir, ...rand, k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, 0, 0, 0);
  }
  return new Float32Array(out);
}

// ---------- shaders ----------
const VS = `#version 300 es
in vec3 a_pos; in vec3 a_center; in vec3 a_dir; in vec4 a_rand; in vec3 a_bary; in vec2 a_uv; in float a_front;
uniform mat4 u_proj; uniform mat4 u_view; uniform mat4 u_model;
uniform vec4 u_react; uniform float u_breathe; uniform float u_burst; uniform float u_reach; uniform float u_time; uniform float u_gap;
uniform float u_mode; uniform float u_snareCount; uniform float u_hitAge[8]; uniform float u_debris; uniform float u_slabMode;
out vec3 v_wpos; out vec4 v_rand; out vec3 v_bary; out vec2 v_uv; out float v_push; out float v_front;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 rotAxis(vec3 p, vec3 ax, float a){ ax = normalize(ax); return p * cos(a) + cross(ax, p) * sin(a) + ax * dot(ax, p) * (1.0 - cos(a)); }
void main(){
  float r = a_rand.x;
  vec3 p;
  float push = 0.0;
  if (u_mode > 1.5) {
    // debris thrown out by recent kicks
    int slot = int(a_rand.y + 0.5);
    float age = u_hitAge[slot];
    float life = 0.9 + a_rand.w * 0.6;
    float alive = step(age, life) * step(r, u_debris);
    vec3 d = a_dir;
    vec3 pos = d * (0.95 + a_rand.z * age * 2.2) + vec3(0.0, -1.4, 0.0) * age * age * 0.5;
    vec3 local = rotAxis(a_pos, vec3(r, 1.0, a_rand.w), age * 9.0 * (r + 0.3)) * (1.0 - age / life) * alive;
    p = pos * alive + local;
    push = 1.0;
  } else if (u_mode > 0.5) {
    // liquid blob: a continuous surface that wobbles and spikes
    vec3 q = a_pos;
    float w = sin(q.x * 4.0 + u_time * 1.3) + sin(q.y * 5.0 - u_time * 1.1) + sin(q.z * 3.5 + u_time * 0.9);
    float spikes = pow(max(0.0, sin(q.x * 13.0) * sin(q.y * 11.0 + 1.3) * sin(q.z * 12.0 + 2.1)), 3.0);
    float disp = w * 0.035 * (1.0 + u_breathe * 3.0) + spikes * u_react.z * 0.9 * u_reach + u_react.x * 0.12 * u_reach;
    disp += u_react.w * 0.08 * max(0.0, sin(q.y * 6.0 - u_time * 3.0));
    p = q * (1.0 + disp) * (1.0 + u_burst * 0.4);
    push = disp * 3.0;
  } else {
    float band = a_rand.y;
    float amt = band < 0.5 ? u_react.x : band < 1.5 ? u_react.y * step(0.45, h11(r * 91.0 + u_snareCount * 7.13)) : u_react.z * step(0.5, r);
    float reachK = band < 0.5 ? 0.26 : band < 1.5 ? 0.18 : 0.09;
    push = amt * u_reach * reachK * (0.6 + a_rand.z * 0.8);
    vec3 wd = normalize(vec3(cos(u_time * 0.7), 0.35, sin(u_time * 0.7)));
    float wave = max(0.0, sin(dot(normalize(a_center + 1e-4), wd) * 5.0 - u_time * 2.5));
    push += u_react.w * wave * 0.14 * u_reach;
    float burst = u_burst * (0.8 + r * 1.6);
    vec3 local = (a_pos - a_center) * (1.0 - u_gap * 0.6 * (1.0 - u_slabMode));
    float tumble = burst * (2.0 + r * 6.0) + push * 2.5 * (r - 0.5);
    local = rotAxis(local, vec3(r - 0.5, a_rand.w - 0.5, 0.3), tumble);
    vec3 fly = a_dir * burst * (0.6 + a_rand.z * 1.0);
    fly.z *= 0.35;
    vec3 c = a_center + a_dir * push + fly;
    c.y -= burst * burst * r * 0.4;
    p = (c + local) * (1.0 + u_breathe * 0.1);
  }
  vec4 w = u_model * vec4(p, 1.0);
  v_wpos = w.xyz; v_rand = a_rand; v_bary = a_bary; v_uv = a_uv; v_push = push; v_front = a_front;
  gl_Position = u_proj * u_view * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 v_wpos; in vec4 v_rand; in vec3 v_bary; in vec2 v_uv; in float v_push; in float v_front;
out vec4 fragColor;
uniform vec3 u_pal[4]; uniform vec3 u_warm; uniform vec3 u_cool; uniform vec3 u_single; uniform vec3 u_cam;
uniform float u_material; uniform float u_colourMode; uniform float u_core; uniform float u_bright; uniform float u_mode; uniform float u_slab;
uniform sampler2D u_logo;
void main(){
  vec3 n = normalize(cross(dFdx(v_wpos), dFdy(v_wpos)));
  vec3 V = normalize(u_cam - v_wpos);
  if (dot(n, V) < 0.0) n = -n;
  float r = v_rand.x;
  if (u_slab > 0.5 && v_front > 0.5) {
    vec2 m = texture(u_logo, v_uv).rg;
    if (m.r < 0.5 || m.g > 0.5) discard;
  }
  vec3 albedo;
  int cm = int(u_colourMode + 0.5);
  if (u_slab > 0.5) albedo = v_front > 0.5 && v_front < 1.5 ? u_single : u_single * 0.4;
  else if (u_mode > 1.5) albedo = u_pal[int(mod(floor(r * 7.0), 3.0))] * 1.2;
  else if (cm == 0) albedo = r < 0.68 ? u_pal[3] * 1.3 + 0.035 : mix(u_pal[int(mod(floor(r * 11.0), 3.0))], u_pal[3], 0.25);
  else if (cm == 1) albedo = u_pal[int(mod(floor(r * 13.0), 4.0))] * 0.9 + 0.03;
  else albedo = u_single * (0.75 + r * 0.4);
  vec3 L1 = normalize(vec3(-0.8, 0.65, 0.55));
  vec3 L2 = normalize(vec3(0.9, -0.25, 0.45));
  float d1 = max(dot(n, L1), 0.0), d2 = max(dot(n, L2), 0.0);
  vec3 c = albedo * (0.07 + d1 * u_warm * 1.15 + d2 * u_cool * 0.95);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  c += fres * u_cool * 0.45;
  int mat = int(u_material + 0.5);
  float alpha = 1.0;
  if (mat == 1 || mat == 2) {
    float s1 = pow(max(dot(reflect(-L1, n), V), 0.0), 36.0), s2 = pow(max(dot(reflect(-L2, n), V), 0.0), 24.0);
    c += s1 * u_warm * 0.9 + s2 * u_cool * 0.6;
  }
  if (mat == 2) { alpha = 0.35 + fres * 0.6; c = c * 0.7 + fres * u_cool * 0.6; }
  if (mat == 3) {
    float e = min(v_bary.x, min(v_bary.y, v_bary.z));
    float line = 1.0 - smoothstep(0.015, 0.04, e);
    if (line < 0.05) discard;
    c = mix(u_cool, u_warm, r) * 1.4; alpha = line;
  }
  // shards that push out catch the glow of the core
  c += u_pal[2] * clamp(v_push, 0.0, 1.0) * u_core * 0.8;
  fragColor = vec4(c * u_bright, alpha);
}`;

// the stage behind the object: inner glow and floor glow, drawn as a full screen pass
const STAGE_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const STAGE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fragColor;
uniform vec2 u_res; uniform vec2 u_centre; uniform float u_radius; uniform float u_core; uniform float u_floor; uniform vec3 u_coreCol; uniform vec3 u_floorCol;
void main(){
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0) - u_centre;
  float d = length(p) / max(u_radius, 0.01);
  float core = exp(-d * d * 1.6) * u_core;
  vec2 fp = (p - vec2(0.0, -u_radius * 1.25)) / vec2(u_radius * 1.4, u_radius * 0.16);
  float fl = exp(-dot(fp, fp)) * u_floor;
  vec3 c = u_coreCol * core + u_floorCol * fl;
  float a = clamp(core + fl, 0.0, 1.0);
  fragColor = vec4(c / max(a, 0.001), a);
}`;

// ---------- matrices ----------
function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f_ = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f_ / aspect, 0, 0, 0, 0, f_, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function mul(a: Float32Array, b: Float32Array) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o;
}
function rotY(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
function rotX(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
function rotZ(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
function translate(x: number, y: number, z: number) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
function scaleM(s: number) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); }

interface Prog { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null>; }

export class HeroRenderer {
  private gl: WebGL2RenderingContext;
  private prog: Prog;
  private stage: Prog;
  private quad: WebGLBuffer;
  private shapes = new Map<string, Built>();
  private debris: Built;
  private vao: WebGLVertexArrayObject;
  errors: string[] = [];

  constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer) {
    this.gl = gl;
    this.quad = quad;
    this.prog = this.compile(VS, FS, ['a_pos', 'a_center', 'a_dir', 'a_rand', 'a_bary', 'a_uv', 'a_front']);
    this.stage = this.compile(STAGE_VS, STAGE_FS, ['a_pos']);
    this.vao = gl.createVertexArray()!;
    this.debris = this.upload(buildDebris());
  }

  private compile(vs: string, fs: string, attrs: string[]): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) this.errors.push('hero: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(prog, i, a));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) this.errors.push('hero link: ' + gl.getProgramInfoLog(prog));
    return { prog, loc: new Map() };
  }
  private u(p: Prog, name: string) { if (!p.loc.has(name)) p.loc.set(name, this.gl.getUniformLocation(p.prog, name)); return p.loc.get(name)!; }

  private upload(data: Float32Array): Built {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf, count: data.length / STRIDE };
  }

  private bindLayout(buf: WebGLBuffer) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const sizes = [3, 3, 3, 4, 3, 2, 1];
    let off = 0;
    sizes.forEach((s, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, s, gl.FLOAT, false, STRIDE * 4, off * 4); off += s; });
  }

  private unbindLayout() {
    const gl = this.gl;
    gl.bindVertexArray(null);
  }

  /** Draw the hero for one clip into the given framebuffer (which must have a depth buffer). */
  render(project: Project, clip: Clip, def: LayerDef, t: number, w: number, h: number, fb: WebGLFramebuffer, pal: Rgb[], logoTex: WebGLTexture) {
    const gl = this.gl;
    const num = (k: string) => { const p = def.params.find((x) => x.key === k)!; return evalNumber(project, clip, p, t); };
    const colour = (k: string) => colourValue(project, clip, def.params.find((x) => x.key === k)!, pal);
    const shape = Math.round(num('shape')), detail = Math.round(num('detail'));
    const thickness = num('thickness'), variation = Math.round(num('variation'));
    const key = `${shape}|${detail}|${thickness.toFixed(2)}|${variation}`;
    let built = this.shapes.get(key);
    if (!built) {
      built = this.upload(buildShape(shape, detail, thickness, variation));
      this.shapes.set(key, built);
      if (this.shapes.size > 24) { const first = this.shapes.keys().next().value!; gl.deleteBuffer(this.shapes.get(first)!.buf); this.shapes.delete(first); }
    }
    const asp = w / h;
    const size = num('size');
    // keep the object a sensible size in tall and wide frames
    const fit = Math.min(1, asp * 0.95);
    const proj = perspective(0.62, asp, 0.1, 50);
    const camZ = 4.4;
    const view = translate(0, 0, -camZ);
    const spin = clipSpin(project, clip, def, t);
    const wob = num('wobble');
    const local = t - clip.start;
    const tilt = num('tilt') * 0.6 + Math.sin(local * 0.5) * wob * 0.25;
    const roll = Math.sin(local * 0.37) * wob * 0.15;
    const px = num('x') * asp * 1.5, py = num('y') * 1.5;
    let model = mul(translate(px, py, 0), mul(rotZ(roll), mul(rotX(tilt), mul(rotY(spin), scaleM(size * fit)))));
    if (shape === 6) model = mul(translate(px, py, 0), mul(rotX(tilt * 0.15), mul(rotY(Math.sin(spin) * 0.35), scaleM(size * fit * 1.3))));

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // stage glow
    const sp = this.stage;
    gl.useProgram(sp.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const radius = 0.34 * size * fit * (shape === 1 || shape === 2 ? 1.3 : 1);
    gl.uniform2f(this.u(sp, 'u_res'), w, h);
    gl.uniform2f(this.u(sp, 'u_centre'), px * 0.354, py * 0.354);
    gl.uniform1f(this.u(sp, 'u_radius'), radius);
    gl.uniform1f(this.u(sp, 'u_core'), num('core'));
    gl.uniform1f(this.u(sp, 'u_floor'), num('floor'));
    gl.uniform3f(this.u(sp, 'u_coreCol'), pal[2][0], pal[2][1], pal[2][2]);
    const warm = colour('warm');
    gl.uniform3f(this.u(sp, 'u_floorCol'), warm[0], warm[1], warm[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // shards
    const p = this.prog;
    gl.useProgram(p.prog);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    const mat = Math.round(num('material'));
    if (mat === 2 || mat === 3) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(mat === 3); }
    gl.uniformMatrix4fv(this.u(p, 'u_proj'), false, proj);
    gl.uniformMatrix4fv(this.u(p, 'u_view'), false, view);
    gl.uniformMatrix4fv(this.u(p, 'u_model'), false, model);
    gl.uniform4f(this.u(p, 'u_react'), num('kick'), num('snare'), num('hats'), num('ripple'));
    gl.uniform1f(this.u(p, 'u_breathe'), num('breathe'));
    gl.uniform1f(this.u(p, 'u_burst'), num('burst'));
    gl.uniform1f(this.u(p, 'u_reach'), num('reach'));
    gl.uniform1f(this.u(p, 'u_time'), local);
    gl.uniform1f(this.u(p, 'u_gap'), num('gap'));
    gl.uniform1f(this.u(p, 'u_snareCount'), eventCount(project, 'snare', t).count);
    gl.uniform1f(this.u(p, 'u_debris'), num('debris'));
    const kicks = project.hits.kick || [];
    const ki = lastHitIndex(kicks, t);
    const ages = new Float32Array(8).fill(99);
    for (let k = 0; k < 8 && ki - k >= 0; k++) { const hit = kicks[ki - k]; ages[(ki - k) % 8] = hit.s > 0.35 ? t - hit.t : 99; }
    gl.uniform1fv(this.u(p, 'u_hitAge'), ages);
    gl.uniform3fv(this.u(p, 'u_pal'), new Float32Array(pal.flat()));
    gl.uniform3f(this.u(p, 'u_warm'), warm[0], warm[1], warm[2]);
    const cool = colour('cool');
    gl.uniform3f(this.u(p, 'u_cool'), cool[0], cool[1], cool[2]);
    const single = colour('colour');
    gl.uniform3f(this.u(p, 'u_single'), single[0], single[1], single[2]);
    gl.uniform3f(this.u(p, 'u_cam'), 0, 0, camZ);
    gl.uniform1f(this.u(p, 'u_material'), mat);
    gl.uniform1f(this.u(p, 'u_colourMode'), num('colourMode'));
    gl.uniform1f(this.u(p, 'u_core'), num('core'));
    gl.uniform1f(this.u(p, 'u_bright'), num('brightness'));
    gl.uniform1f(this.u(p, 'u_slab'), shape === 6 ? 1 : 0);
    gl.uniform1f(this.u(p, 'u_slabMode'), shape === 6 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, logoTex);
    gl.uniform1i(this.u(p, 'u_logo'), 0);

    gl.uniform1f(this.u(p, 'u_mode'), shape === 5 ? 1 : 0);
    this.bindLayout(built.buf);
    gl.drawArrays(gl.TRIANGLES, 0, built.count);
    if (num('debris') > 0.01 && shape !== 6) {
      gl.uniform1f(this.u(p, 'u_mode'), 2);
      gl.uniform1f(this.u(p, 'u_colourMode'), 0);
      this.bindLayout(this.debris.buf);
      gl.drawArrays(gl.TRIANGLES, 0, this.debris.count);
    }
    this.unbindLayout();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }
}
