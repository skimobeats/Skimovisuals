import { LayerDef, ParamDef, f, sel, col, mod } from './types';

export const SEQ_CHANGE = ['Every beat', 'Every 2 beats', 'Every bar', 'Every 2 bars', 'Every 4 bars', 'Every 8 bars', 'Every kick', 'Every snare', 'At section markers'];
export const SEQ_TRANSITIONS = ['Crossfade', 'Liquid morph', 'Glitch cut', 'Zoom through', 'Slide', 'Pixel dissolve', 'Hard cut'];

function mediaParams(text: boolean): ParamDef[] {
  const ps: ParamDef[] = [
    sel('fit', 'Fit', ['Fill frame', 'Fit inside', 'Stretch'], text ? 1 : 0, { group: 'Position' }),
    f('scale', 'Size', 0.05, 4, text ? 0.6 : 1, { group: 'Position' }),
    f('x', 'Position X', -1, 1, 0, { group: 'Position' }),
    f('y', 'Position Y', -1, 1, 0, { group: 'Position' }),
    f('rotate', 'Rotation', -180, 180, 0, { step: 1, group: 'Position' }),
    f('spin', 'Spin speed', -2, 2, 0, { group: 'Position' }),
    f('pulse', 'Pulse', 0, 1, 0, { group: 'Position' }),
    f('warp', 'Warp', 0, 1, 0, { group: 'Distort' }),
    f('warpScale', 'Warp detail', 0.5, 10, 3, { group: 'Distort' }),
    f('melt', 'Melt', 0, 1, 0, { group: 'Distort' }),
    f('ripple', 'Ripple', 0, 1, 0, { group: 'Distort' }),
    f('shatter', 'Break into particles', 0, 1, 0, { group: 'Distort' }),
    f('fragments', 'Particle count', 4, 120, 30, { step: 1, group: 'Distort' }),
    f('pixelate', 'Pixelate', 0, 1, 0, { group: 'Distort' }),
    f('glitch', 'Glitch', 0, 1, 0, { group: 'Distort' }),
    f('rgbSplit', 'RGB split', 0, 1, 0, { group: 'Distort' }),
    sel('mirror', 'Mirror', ['Off', 'Left / right', 'Top / bottom', 'Four way', 'Kaleidoscope', 'Tile'], 0, { group: 'Mirror' }),
    f('segments', 'Kaleidoscope segments', 2, 16, 6, { step: 1, group: 'Mirror' }),
    f('tiles', 'Tiles', 1, 8, 2, { step: 1, group: 'Mirror' }),
    col('colour', text ? 'Text colour' : 'Tint colour', 'p0', { group: 'Colour' }),
    f('tint', 'Tint', 0, 1, text ? 1 : 0, { group: 'Colour' }),
    f('paletteMap', 'Palette recolour', 0, 1, 0, { group: 'Colour' }),
    f('brightness', 'Brightness', 0, 3, 1, { group: 'Colour' }),
    f('contrast', 'Contrast', 0, 3, 1, { group: 'Colour' }),
    f('saturation', 'Saturation', 0, 3, 1, { group: 'Colour' }),
    f('hue', 'Hue shift', -1, 1, 0, { group: 'Colour' }),
    f('keyDark', 'Remove dark background', 0, 1, 0, { group: 'Colour' }),
    f('keyLight', 'Remove light background', 0, 1, 0, { group: 'Colour' })
  ];
  if (!text) {
    ps.push(
      sel('change', 'Change image', SEQ_CHANGE, 4, { group: 'Sequence' }),
      sel('transition', 'Transition', SEQ_TRANSITIONS, 1, { group: 'Sequence' }),
      f('transLen', 'Transition length (beats)', 0.05, 8, 1, { group: 'Sequence' }),
      sel('order', 'Order', ['In order', 'Shuffle'], 0, { group: 'Sequence' })
    );
  }
  return ps;
}

const MEDIA_GLSL = `
vec4 sampleFit(sampler2D tex, vec2 res, vec2 p){
  float ca = aspect(); float ia = res.x / max(res.y, 1.0);
  int fit = int(p_fit + 0.5);
  vec2 size;
  if (fit == 0) size = ia > ca ? vec2(ia, 1.0) : vec2(ca, ca / ia);
  else if (fit == 1) size = ia > ca ? vec2(ca, ca / ia) : vec2(ia, 1.0);
  else size = vec2(ca, 1.0);
  vec2 uv = p / size + 0.5;
  vec2 e = smoothstep(vec2(0.0), vec2(0.002), uv) * smoothstep(vec2(1.0), vec2(0.998), uv);
  vec4 c = texture(tex, clamp(uv, 0.0, 1.0));
  c.a *= e.x * e.y;
  return c;
}
vec4 seq(vec2 p){
  float m = clamp(u_morph, 0.0, 1.0);
  int tr = int(p_transition + 0.5);
  if (m <= 0.0) return sampleFit(u_tex0, u_tex0Res, p);
  if (m >= 1.0) return sampleFit(u_tex1, u_tex1Res, p);
  if (tr == 0) return mix(sampleFit(u_tex0, u_tex0Res, p), sampleFit(u_tex1, u_tex1Res, p), m);
  if (tr == 1){
    vec2 d = (vec2(fbm(p * 3.0 + u_morphSeed), fbm(p * 3.0 + 7.0 + u_morphSeed)) - 0.5) * 0.8;
    float k = smoothstep(0.0, 1.0, m);
    vec4 a = sampleFit(u_tex0, u_tex0Res, p + d * k);
    vec4 b = sampleFit(u_tex1, u_tex1Res, p - d * (1.0 - k));
    float th = smoothstep(k - 0.2, k + 0.2, fbm(p * 2.0 + u_morphSeed * 3.0) * 0.6 + 0.2);
    return mix(b, a, th);
  }
  if (tr == 2){
    vec2 bid = floor(p * vec2(12.0, 8.0));
    float h = hash21(bid + u_morphSeed);
    vec2 jit = (hash22(bid + floor(m * 10.0)) - 0.5) * 0.05 * sin(m * PI);
    return h < m ? sampleFit(u_tex1, u_tex1Res, p + jit) : sampleFit(u_tex0, u_tex0Res, p - jit);
  }
  if (tr == 3){
    vec4 a = sampleFit(u_tex0, u_tex0Res, p / (1.0 + m * 3.0));
    vec4 b = sampleFit(u_tex1, u_tex1Res, p * (1.0 + (1.0 - m) * 3.0));
    return mix(a, b, smoothstep(0.3, 0.7, m));
  }
  if (tr == 4){
    float k = smoothstep(0.0, 1.0, m) * aspect();
    vec4 a = sampleFit(u_tex0, u_tex0Res, p + vec2(k, 0.0));
    vec4 b = sampleFit(u_tex1, u_tex1Res, p + vec2(k - aspect(), 0.0));
    return p.x < aspect() * 0.5 - k ? a : b;
  }
  if (tr == 5){
    float cells = mix(400.0, 12.0, sin(m * PI));
    vec2 q = (floor(p * cells) + 0.5) / cells;
    return m < 0.5 ? sampleFit(u_tex0, u_tex0Res, q) : sampleFit(u_tex1, u_tex1Res, q);
  }
  return m < 0.5 ? sampleFit(u_tex0, u_tex0Res, p) : sampleFit(u_tex1, u_tex1Res, p);
}
vec4 layer(){
  vec2 p = centered(v_uv);
  int mi = int(p_mirror + 0.5);
  if (mi == 1 || mi == 3) p.x = -abs(p.x);
  if (mi == 2 || mi == 3) p.y = abs(p.y);
  if (mi == 4){ float n = floor(p_segments); float a = atan(p.y, p.x); float r = length(p); float s = TAU / n; a = mod(a, s); a = abs(a - s * 0.5); p = vec2(cos(a), sin(a)) * r; }
  p -= vec2(p_x * aspect() * 0.5, p_y * 0.5);
  p = rot(radians(p_rotate) + u_time * p_spin) * p;
  p /= max(0.01, p_scale * (1.0 + p_pulse * 0.35));
  if (mi == 5){ vec2 tl = vec2(aspect(), 1.0) / floor(p_tiles); p = abs(mod(p + tl * 0.5, tl * 2.0) - tl) - tl * 0.5; p *= floor(p_tiles); }
  if (p_warp > 0.0) p += (vec2(fbm(p * p_warpScale + u_time * 0.2), fbm(p * p_warpScale + 4.0 - u_time * 0.2)) - 0.5) * p_warp * 0.5;
  if (p_ripple > 0.0) p += normalize(p + 0.0001) * sin(length(p) * 25.0 - u_time * 5.0) * p_ripple * 0.03;
  if (p_melt > 0.0){
    float drip = fbm(vec2(p.x * 6.0, 0.5)) * (0.6 + 0.4 * sin(u_time * 0.5 + p.x * 3.0));
    p.y += drip * p_melt * 0.35 * (0.5 - p.y);
    p.x += sin(p.y * 10.0 + u_time) * p_melt * 0.02;
  }
  float fragMask = 1.0;
  if (p_shatter > 0.0){
    float n = floor(p_fragments);
    vec2 cid = floor(p * n);
    vec2 h = hash22(cid + 3.7);
    vec2 dir = normalize((cid + 0.5) / n + (h - 0.5) * 0.5 + 0.0001);
    float lift = p_shatter * (0.3 + h.x * 0.7);
    vec2 fr = fract(p * n) - 0.5;
    float sz = 0.5 - p_shatter * 0.35 * (0.5 + h.y);
    fragMask = step(max(abs(fr.x), abs(fr.y)), sz);
    p -= dir * lift * 0.25 * vec2(1.0, 1.0);
  }
  if (p_pixelate > 0.0){ float cells = mix(400.0, 8.0, p_pixelate); p = (floor(p * cells) + 0.5) / cells; }
  if (p_glitch > 0.0){
    float tt = floor(u_t * 12.0);
    vec2 bid = floor(p * vec2(10.0, 24.0));
    if (hash21(bid + tt) < p_glitch * 0.4) p.x += (hash21(bid * 1.3 + tt) - 0.5) * 0.2 * p_glitch;
  }
  vec4 c;
  if (p_rgbSplit > 0.0){
    float o = p_rgbSplit * 0.03;
    vec4 a = seq(p + vec2(o, 0.0)); vec4 b = seq(p); vec4 d = seq(p - vec2(o, 0.0));
    c = vec4(a.r, b.g, d.b, max(a.a, max(b.a, d.a)));
  } else c = seq(p);
  c.a *= fragMask;
  vec3 rgb = c.rgb;
  float L = luma(rgb);
  if (p_keyDark > 0.0) c.a *= smoothstep(p_keyDark * 0.6, p_keyDark * 0.6 + 0.08, L);
  if (p_keyLight > 0.0) c.a *= 1.0 - smoothstep(1.0 - p_keyLight * 0.6 - 0.08, 1.0 - p_keyLight * 0.6, L);
  rgb = mix(rgb, rgb * p_colour, p_tint);
  rgb = mix(rgb, palLinear(L), p_paletteMap);
  rgb = hueShift(rgb, p_hue);
  rgb = (rgb - 0.5) * p_contrast + 0.5;
  rgb = saturate3(rgb, p_saturation) * p_brightness * (1.0 + p_pulse * 0.4);
  return vec4(max(rgb, 0.0), clamp(c.a, 0.0, 1.0));
}`;

export const MEDIA_LAYERS: LayerDef[] = [
  {
    id: 'media', name: 'Image / Video', category: 'media', tags: ['media'],
    description: 'Your own pictures and clips. Add several to make them morph from one to the next.',
    params: mediaParams(false),
    defaultMods: { pulse: mod('kick', 0.4, 0.2) },
    glsl: MEDIA_GLSL
  },
  {
    id: 'text', name: 'Text', category: 'text', tags: ['text'],
    description: 'Your artist name, track title or any words.',
    params: mediaParams(true),
    defaultMods: { pulse: mod('kick', 0.3, 0.2) },
    glsl: '#define p_transition 0.0\n' + MEDIA_GLSL
  }
];

export const TEXT_FONTS = [
  'Arial Black', 'Arial', 'Impact', 'Bahnschrift', 'Segoe UI', 'Segoe UI Black', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Georgia', 'Times New Roman', 'Courier New', 'Consolas', 'Lucida Console', 'Franklin Gothic Medium', 'Gill Sans MT', 'Century Gothic', 'Comic Sans MS'
];
