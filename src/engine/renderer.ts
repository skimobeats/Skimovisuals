import type { Clip, MediaItem, Project } from '../types';
import { VERT, HEADER, COPY_FRAG, BLEND_FRAG, BLEND_MODES } from './glsl';
import { getDef, PADS, PAD_MAP } from './registry';
import type { LayerDef } from './layers/types';
import { evalNumber, paletteAt, colourValue, clipClock, clipOpacity, hashString, resetClocks, Rgb } from './params';
import { beatInfo, spectrumAt, lastHitIndex } from '../audio/sources';
import { platform } from '../platform';
import { SEQ_CHANGE } from './layers/media';

interface Program { prog: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null>; }
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number; }

interface MediaTex { tex: WebGLTexture; w: number; h: number; ready: boolean; el?: HTMLImageElement | HTMLVideoElement; kind: 'image' | 'video'; lastUpload: number; }

export class Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  private quad: WebGLBuffer;
  private programs = new Map<string, Program>();
  private copyProg: Program;
  private blendProg: Program;
  private accA!: Target; private accB!: Target; private layer!: Target; private out8?: Target;
  private feedback = new Map<string, { a: Target; b: Target; lastT: number }>();
  private media = new Map<string, MediaTex>();
  private textTex = new Map<string, { key: string; tex: WebGLTexture; w: number; h: number }>();
  private black: WebGLTexture;
  private hdr: boolean;
  private w = 0; private h = 0;
  private spec = new Float32Array(32);
  errors: string[] = [];
  onMediaReady?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available on this computer.');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.copyProg = this.compile('__copy', COPY_FRAG);
    this.blendProg = this.compile('__blend', BLEND_FRAG);
    this.black = this.makeTex(1, 1, new Uint8Array([0, 0, 0, 0]));
  }

  // ---------- GL helpers ----------
  private makeTex(w: number, h: number, data: Uint8Array | null = null, hdr = false) {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private makeTarget(w: number, h: number, hdr = this.hdr): Target {
    const gl = this.gl;
    const tex = this.makeTex(w, h, null, hdr);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { fb, tex, w, h };
  }

  private freeTarget(t?: Target) { if (!t) return; this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); }

  private compile(id: string, frag: string): Program {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        this.errors.push(`${id}: ${log}`);
        console.error(id, log);
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.errors.push(`${id}: ${gl.getProgramInfoLog(prog)}`); }
    return { prog, uniforms: new Map() };
  }

  private program(def: LayerDef): Program {
    let p = this.programs.get(def.id);
    if (!p) {
      const decl = def.params.map((pd) => pd.type === 'colour' ? `uniform vec3 p_${pd.key};` : `uniform float p_${pd.key};`).join('\n');
      const src = `${HEADER}\n${decl}\n${def.glsl}\nvoid main(){ fragColor = layer(); }`;
      p = this.compile(def.id, src);
      this.programs.set(def.id, p);
    }
    return p;
  }

  /** Compile every shader up front so the first play is smooth. Returns any errors. */
  warmUp(defs: LayerDef[]) { for (const d of defs) this.program(d); return this.errors; }

  private loc(p: Program, name: string) {
    if (!p.uniforms.has(name)) p.uniforms.set(name, this.gl.getUniformLocation(p.prog, name));
    return p.uniforms.get(name)!;
  }

  private draw(p: Program, target: Target | null, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindTex(p: Program, name: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc(p, name), unit);
  }

  resize(w: number, h: number) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.freeTarget(this.accA); this.freeTarget(this.accB); this.freeTarget(this.layer); this.freeTarget(this.out8);
    this.out8 = undefined;
    this.accA = this.makeTarget(w, h); this.accB = this.makeTarget(w, h); this.layer = this.makeTarget(w, h);
    for (const f of this.feedback.values()) { this.freeTarget(f.a); this.freeTarget(f.b); }
    this.feedback.clear();
  }

  resetState() {
    for (const f of this.feedback.values()) { this.freeTarget(f.a); this.freeTarget(f.b); }
    this.feedback.clear();
    resetClocks();
  }

  // ---------- Media ----------
  private uploadFromElement(m: MediaTex, el: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  mediaTex(item: MediaItem): MediaTex {
    let m = this.media.get(item.id);
    if (m) return m;
    const tex = this.makeTex(1, 1, new Uint8Array([0, 0, 0, 0]));
    m = { tex, w: item.width || 1, h: item.height || 1, ready: false, kind: item.kind, lastUpload: -1 };
    this.media.set(item.id, m);
    const mt = m;
    if (item.kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { mt.w = img.naturalWidth; mt.h = img.naturalHeight; this.uploadFromElement(mt, img); mt.ready = true; this.onMediaReady?.(); };
      img.src = platform.mediaUrl(item.path);
      mt.el = img;
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => { mt.w = v.videoWidth; mt.h = v.videoHeight; mt.ready = true; this.uploadFromElement(mt, v); this.onMediaReady?.(); };
      v.src = platform.mediaUrl(item.path);
      mt.el = v;
    }
    return m;
  }

  /** Wait until every image and video in the project has loaded (used before exporting) */
  async preloadMedia(project: Project) {
    await Promise.all(project.media.map((item) => {
      const m = this.mediaTex(item);
      if (m.ready || !m.el) return null;
      const el = m.el;
      return new Promise<void>((res) => {
        const done = () => res();
        el.addEventListener(item.kind === 'image' ? 'load' : 'loadeddata', done, { once: true });
        el.addEventListener('error', done, { once: true });
        setTimeout(done, 15000);
      });
    }));
  }

  forgetMedia(id: string) {
    const m = this.media.get(id);
    if (!m) return;
    this.gl.deleteTexture(m.tex);
    if (m.el instanceof HTMLVideoElement) { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); }
    this.media.delete(id);
  }

  /** Make sure videos are at the right frame. exact=true waits for seeking (used when exporting). */
  async syncVideos(project: Project, t: number, exact: boolean, playing: boolean) {
    const waits: Promise<void>[] = [];
    const used = new Set<string>();
    for (const clip of project.clips) {
      if (clip.type !== 'media' || t < clip.start || t >= clip.end) continue;
      const seqInfo = this.sequenceState(project, clip, t);
      for (const idx of [seqInfo.a, seqInfo.b]) {
        const id = clip.mediaIds?.[idx];
        const item = project.media.find((x) => x.id === id);
        if (!item || item.kind !== 'video') continue;
        const m = this.mediaTex(item);
        const v = m.el as HTMLVideoElement;
        if (!m.ready || !v.duration) continue;
        used.add(item.id);
        const target = ((t - clip.start + (clip.mediaOffset || 0)) % v.duration + v.duration) % v.duration;
        if (exact) {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.001) {
            waits.push(new Promise((res) => {
              const done = () => { v.removeEventListener('seeked', done); res(); };
              v.addEventListener('seeked', done);
              v.currentTime = target;
              setTimeout(done, 1500);
            }));
          }
        } else if (playing) {
          if (v.paused) { v.currentTime = target; v.play().catch(() => {}); }
          else if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target;
        }
      }
    }
    for (const [id, m] of this.media) {
      if (m.kind === 'video' && !used.has(id)) { const v = m.el as HTMLVideoElement; if (!v.paused) v.pause(); }
    }
    await Promise.all(waits);
    if (exact) for (const id of used) { const m = this.media.get(id)!; this.uploadFromElement(m, m.el as HTMLVideoElement); m.lastUpload = t; }
  }

  private textTexture(clip: Clip): { tex: WebGLTexture; w: number; h: number } {
    const text = clip.text || 'TEXT';
    const font = clip.font || 'Arial Black';
    const key = `${text}|${font}`;
    const cached = this.textTex.get(clip.id);
    if (cached && cached.key === key) return cached;
    if (cached) this.gl.deleteTexture(cached.tex);
    const lines = text.split('\n');
    const size = 160;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `${size}px "${font}", Arial, sans-serif`;
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width), 10)) + size * 0.4;
    const h = Math.ceil(lines.length * size * 1.15 + size * 0.3);
    c.width = w; c.height = h;
    ctx.font = `${size}px "${font}", Arial, sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, size * 0.15 + size * 1.15 * (i + 0.5)));
    const tex = this.makeTex(1, 1);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const entry = { key, tex, w, h };
    this.textTex.set(clip.id, entry);
    return entry;
  }

  /** Which images are showing in a media clip, and how far through a transition */
  sequenceState(project: Project, clip: Clip, t: number): { a: number; b: number; morph: number; seed: number } {
    const n = clip.mediaIds?.length || 0;
    if (n <= 1) return { a: 0, b: 0, morph: 0, seed: 0 };
    const change = Number(clip.params.change ?? 4);
    const transIdx = Number(clip.params.transition ?? 1);
    const transBeats = Number(clip.params.transLen ?? 1);
    const shuffle = Number(clip.params.order ?? 0) === 1;
    const { beatLen, beatPos } = beatInfo(project, t);
    let count = 0, sinceSec = 99;
    const label = SEQ_CHANGE[change] || '';
    if (label.includes('kick') || label.includes('snare')) {
      const hits = project.hits[label.includes('kick') ? 'kick' : 'snare'] || [];
      const i = lastHitIndex(hits, t);
      const i0 = lastHitIndex(hits, clip.start);
      count = Math.max(0, i - i0);
      if (i >= 0 && count > 0) sinceSec = t - hits[i].t;
    } else if (label.includes('marker')) {
      const ms = project.markers.filter((m) => m.t > clip.start && m.t <= t).sort((a, b) => a.t - b.t);
      count = ms.length;
      if (count) sinceSec = t - ms[ms.length - 1].t;
    } else {
      const beats = [1, 2, 4, 8, 16, 32][change] ?? 4;
      const startPos = beatInfo(project, clip.start).beatPos;
      const k0 = Math.floor(startPos / beats);
      const k = Math.floor(beatPos / beats);
      count = Math.max(0, k - k0);
      if (count > 0) sinceSec = (beatPos - k * beats) * beatLen;
    }
    const pick = (c: number) => {
      if (!shuffle) return ((c % n) + n) % n;
      let idx = Math.floor(hashString(clip.id + ':' + c) * n);
      const prevIdx = c > 0 ? Math.floor(hashString(clip.id + ':' + (c - 1)) * n) : -1;
      if (idx === prevIdx) idx = (idx + 1) % n;
      return idx;
    };
    const cur = pick(count);
    const prev = pick(count - 1);
    const len = transIdx === 6 ? 0 : transBeats * beatLen;
    const m = count === 0 ? 1 : len <= 0 ? 1 : Math.min(1, sinceSec / len);
    return { a: m >= 1 ? cur : prev, b: cur, morph: m >= 1 ? 0 : m, seed: count * 1.618 };
  }

  // ---------- Rendering ----------
  private setUniforms(p: Program, project: Project, clip: Clip, def: LayerDef, t: number, pal: Rgb[], w: number, h: number) {
    const gl = this.gl;
    const { beatPos } = beatInfo(project, t);
    gl.uniform2f(this.loc(p, 'u_res'), w, h);
    gl.uniform1f(this.loc(p, 'u_time'), clipClock(project, clip, def, t));
    gl.uniform1f(this.loc(p, 'u_t'), t);
    gl.uniform1f(this.loc(p, 'u_beat'), beatPos);
    gl.uniform1f(this.loc(p, 'u_seed'), hashString(clip.id) * 100);
    gl.uniform3fv(this.loc(p, 'u_pal'), new Float32Array(pal.flat()));
    gl.uniform1fv(this.loc(p, 'u_spec'), this.spec);
    for (const pd of def.params) {
      const l = this.loc(p, 'p_' + pd.key);
      if (!l) continue;
      if (pd.type === 'colour') { const c = colourValue(project, clip, pd, pal); gl.uniform3f(l, c[0], c[1], c[2]); }
      else gl.uniform1f(l, evalNumber(project, clip, pd, t));
    }
  }

  private renderClip(project: Project, clip: Clip, t: number, w: number, h: number, opacityMul = 1) {
    const def = getDef(clip.type);
    const p = this.program(def);
    const gl = this.gl;
    const pal = paletteAt(project, t, clip.paletteId);
    gl.useProgram(p.prog);
    this.setUniforms(p, project, clip, def, t, pal, w, h);
    this.bindTex(p, 'u_input', 0, this.accA.tex);
    this.bindTex(p, 'u_tex0', 2, this.black);
    this.bindTex(p, 'u_tex1', 3, this.black);
    gl.uniform1f(this.loc(p, 'u_morph'), 0);
    if (def.category === 'media') {
      const seq = this.sequenceState(project, clip, t);
      const ids = clip.mediaIds || [];
      const ta = this.texFor(project, ids[seq.a], t), tb = this.texFor(project, ids[seq.b], t);
      this.bindTex(p, 'u_tex0', 2, ta.tex); this.bindTex(p, 'u_tex1', 3, tb.tex);
      gl.uniform2f(this.loc(p, 'u_tex0Res'), ta.w, ta.h);
      gl.uniform2f(this.loc(p, 'u_tex1Res'), tb.w, tb.h);
      gl.uniform1f(this.loc(p, 'u_morph'), seq.morph);
      gl.uniform1f(this.loc(p, 'u_morphSeed'), seq.seed);
    } else if (def.category === 'text') {
      const tt = this.textTexture(clip);
      this.bindTex(p, 'u_tex0', 2, tt.tex); this.bindTex(p, 'u_tex1', 3, tt.tex);
      gl.uniform2f(this.loc(p, 'u_tex0Res'), tt.w, tt.h);
      gl.uniform2f(this.loc(p, 'u_tex1Res'), tt.w, tt.h);
    }
    let target = this.layer;
    let fbEntry: { a: Target; b: Target; lastT: number } | undefined;
    if (def.feedback) {
      fbEntry = this.feedback.get(clip.id);
      const jumped = fbEntry && (t < fbEntry.lastT || t - fbEntry.lastT > 0.5);
      if (!fbEntry || jumped || fbEntry.a.w !== w || fbEntry.a.h !== h) {
        if (fbEntry) { this.freeTarget(fbEntry.a); this.freeTarget(fbEntry.b); }
        fbEntry = { a: this.makeTarget(w, h), b: this.makeTarget(w, h), lastT: t };
        this.feedback.set(clip.id, fbEntry);
      }
      this.bindTex(p, 'u_prev', 1, fbEntry.a.tex);
      target = fbEntry.b;
    } else {
      this.bindTex(p, 'u_prev', 1, this.black);
    }
    this.draw(p, target, w, h);
    if (fbEntry) { const tmp = fbEntry.a; fbEntry.a = fbEntry.b; fbEntry.b = tmp; fbEntry.lastT = t; }

    // blend onto the accumulated image
    const bp = this.blendProg;
    gl.useProgram(bp.prog);
    this.bindTex(bp, 'u_src', 0, target.tex);
    this.bindTex(bp, 'u_dst', 1, this.accA.tex);
    gl.uniform1f(this.loc(bp, 'u_opacity'), clipOpacity(clip, t) * opacityMul);
    gl.uniform1i(this.loc(bp, 'u_mode'), Math.max(0, BLEND_MODES.indexOf(clip.blend)));
    this.draw(bp, this.accB, w, h);
    const tmp = this.accA; this.accA = this.accB; this.accB = tmp;
  }

  private texFor(project: Project, id: string | undefined, t: number) {
    const item = id ? project.media.find((m) => m.id === id) : undefined;
    if (!item) return { tex: this.black, w: 1, h: 1 };
    const m = this.mediaTex(item);
    if (m.kind === 'video' && m.ready && m.lastUpload !== t) {
      const v = m.el as HTMLVideoElement;
      if (v.readyState >= 2) { this.uploadFromElement(m, v); m.lastUpload = t; }
    }
    return { tex: m.tex, w: m.w, h: m.h };
  }

  /** Render the whole project at time t into the accumulator. */
  renderFrame(project: Project, t: number, w: number, h: number, extraPads: string[] = []) {
    const gl = this.gl;
    if (w !== this.w || h !== this.h) this.resize(w, h);
    spectrumAt(t, this.spec);
    const bg = project.settings.background || '#000000';
    const n = parseInt(bg.slice(1), 16) || 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accA.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const trackOrder = new Map(project.tracks.map((tr, i) => [tr.id, i]));
    const hidden = new Set(project.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
    const active = project.clips
      .filter((c) => t >= c.start && t < c.end && !hidden.has(c.trackId) && trackOrder.has(c.trackId))
      .sort((a, b) => (trackOrder.get(a.trackId)! - trackOrder.get(b.trackId)!) || a.start - b.start);
    for (const c of active) this.renderClip(project, c, t, w, h);
    // performance pads on top of everything
    const padIds = new Set(extraPads);
    for (const e of project.pads) if (t >= e.start && t < e.end) padIds.add(e.pad);
    for (const pad of PADS) {
      if (!padIds.has(pad.id)) continue;
      const def = PAD_MAP.get(pad.id)!;
      const params = { ...def.params };
      if (def.strobe) { const { beatPos } = beatInfo(project, t); params.amount = (beatPos * 4) % 1 < 0.5 ? 1 : 0; }
      const clip: Clip = { id: 'pad-' + pad.id, trackId: '', type: def.type, name: def.label, start: 0, end: 1e9, params, mods: {}, keys: {}, blend: 'normal', opacity: 1, fadeIn: 0, fadeOut: 0 };
      this.renderClip(project, clip, t, w, h);
    }
  }

  /** Draw the current frame to the visible canvas. */
  present() {
    const p = this.copyProg;
    const gl = this.gl;
    gl.useProgram(p.prog);
    this.bindTex(p, 'u_src', 0, this.accA.tex);
    gl.uniform1f(this.loc(p, 'u_flip'), 0);
    this.draw(p, null, this.w, this.h);
  }

  /** Read the frame back as top down RGBA bytes for the video encoder. */
  readPixels(out: Uint8Array) {
    const gl = this.gl;
    if (!this.out8 || this.out8.w !== this.w || this.out8.h !== this.h) { this.freeTarget(this.out8); this.out8 = this.makeTarget(this.w, this.h, false); }
    const p = this.copyProg;
    gl.useProgram(p.prog);
    this.bindTex(p, 'u_src', 0, this.accA.tex);
    gl.uniform1f(this.loc(p, 'u_flip'), 1);
    this.draw(p, this.out8, this.w, this.h);
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  }

  get size() { return { w: this.w, h: this.h }; }
}
