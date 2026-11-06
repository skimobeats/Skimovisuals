import { LayerDef, f, sel, col, mod } from './types';

// The Skimo stencil logo: a solid slanted shape with SKIMO cut out of it.
// Everything below shows through the letters. u_tex0 holds the masks: red = shape, green = letters.
export const LOGO_ASPECT = 2.0591;

export const LETTER_FX = ['Flash', 'Zoom', 'Invert', 'Colour fill', 'Hue shift', 'Glitch'];
export const MORPH_SHAPES = ['Wedge', 'Parallelogram', 'Tall', 'Flag wave'];

export const LOGO_LAYER: LayerDef = {
  id: 'logo', name: 'Skimo Logo', category: 'logo', tags: ['logo'],
  description: 'Your stencil logo. Visuals show through the letters, each letter reacts to its own part of the track, and the shape glitches, skews and morphs to the music.',
  params: [
    f('scale', 'Size', 0.1, 2.5, 0.85, { group: 'Position' }),
    f('x', 'Position X', -1, 1, 0, { group: 'Position' }),
    f('y', 'Position Y', -1, 1, 0, { group: 'Position' }),
    f('rotate', 'Rotation', -180, 180, 0, { step: 1, group: 'Position' }),
    col('colour', 'Logo colour', 'p0', { group: 'Look' }),
    col('ink2', 'Second ink (print slip)', 'p1', { group: 'Look' }),
    f('pulse', 'Brighten', 0, 1, 0, { group: 'Look' }),
    f('texture', 'Print texture', 0, 1, 0.35, { group: 'Look' }),
    f('shadow', 'Shadow', 0, 1, 0.45, { group: 'Look' }),
    f('outside', 'Darken around logo', 0, 1, 0, { group: 'Look' }),
    sel('letterFx', 'Letter reaction', LETTER_FX, 0, { group: 'Letters' }),
    f('s', 'S', 0, 1, 0, { group: 'Letters' }),
    f('k', 'K', 0, 1, 0, { group: 'Letters' }),
    f('i', 'I', 0, 1, 0, { group: 'Letters' }),
    f('m', 'M', 0, 1, 0, { group: 'Letters' }),
    f('o', 'O', 0, 1, 0, { group: 'Letters' }),
    f('glitch', 'Glitch slices', 0, 1, 0, { group: 'Shape' }),
    f('skew', 'Skew snap', -1, 1, 0, { group: 'Shape' }),
    f('stretch', 'Stretch and squash', -1, 1, 0, { group: 'Shape' }),
    f('jolt', 'Corner jolts', 0, 1, 0, { group: 'Shape' }),
    f('slip', 'Print slip', 0, 1, 0, { group: 'Shape' }),
    f('shatter', 'Shatter', 0, 1, 0, { group: 'Shape' }),
    f('breathe', 'Breathe', 0, 1, 0, { group: 'Shape' }),
    f('melt', 'Melt', 0, 1, 0, { group: 'Shape' }),
    f('tension', 'Tension (jitter)', 0, 1, 0, { group: 'Shape' }),
    sel('morphShape', 'Morph into', MORPH_SHAPES, 0, { group: 'Shape' }),
    f('morph', 'Morph amount', 0, 1, 0, { group: 'Shape' })
  ],
  defaultMods: {
    s: mod('kick', 0.9, 0.18), k: mod('snare', 0.9, 0.2), i: mod('hats', 0.8, 0.1), m: mod('bass', 0.6, 0.3), o: mod('mids', 0.6, 0.3),
    glitch: mod('snare', 0.35, 0.12), skew: mod('kick', 0.12, 0.15), stretch: mod('kick', 0.12, 0.2), jolt: mod('hats', 0.2, 0.1),
    slip: mod('snare', 0.3, 0.2), breathe: mod('bass', 0.45, 0.3), pulse: mod('kick', 0.25, 0.2), tension: mod('sectionramp', 0.2, 0.3)
  },
  glsl: `
const float LA = ${LOGO_ASPECT};
vec2 maskAt(vec2 iuv){
  if (iuv.x < 0.0 || iuv.y < 0.0 || iuv.x > 1.0 || iuv.y > 1.0) return vec2(0.0);
  return texture(u_tex0, vec2(iuv.x, 1.0 - iuv.y)).rg;
}
vec2 bilerp(vec2 a, vec2 b, vec2 c, vec2 d, vec2 uv){ return mix(mix(a, b, uv.x), mix(d, c, uv.x), uv.y); }
// corner offsets for the morph targets: top left, top right, bottom right, bottom left
void morphCorners(int s, out vec2 tl, out vec2 tr, out vec2 br, out vec2 bl){
  tl = vec2(0.0); tr = vec2(0.0); br = vec2(0.0); bl = vec2(0.0);
  if (s == 0){ tl = vec2(0.0, 0.12); tr = vec2(0.06, 0.32); br = vec2(0.06, -0.3); bl = vec2(0.0, -0.1); }
  else if (s == 1){ tl = vec2(0.12, 0.0); tr = vec2(0.0, -0.2); br = vec2(-0.05, -0.17); bl = vec2(-0.1, 0.0); }
  else if (s == 2){ tl = vec2(0.05, -0.3); tr = vec2(-0.05, -0.3); br = vec2(-0.05, 0.3); bl = vec2(0.05, 0.3); }
}
vec2 warp(vec2 iuv){
  float tt = floor(u_t * 12.0);
  vec2 c = iuv - 0.5;
  // stretch and squash about the centre
  c /= vec2(1.0 + p_stretch * 0.28, 1.0 - p_stretch * 0.16);
  // skew snap
  c.x += c.y * p_skew * 0.45;
  iuv = c + 0.5;
  // corner jolts, morph targets and tension jitter, blended across the shape
  vec2 tl, tr, br, bl; morphCorners(int(p_morphShape + 0.5), tl, tr, br, bl);
  float jt = p_jolt * 0.08 + p_tension * 0.03;
  vec2 j0 = (vec2(hash11(tt + 1.0), hash11(tt + 2.0)) - 0.5) * jt;
  vec2 j1 = (vec2(hash11(tt + 3.0), hash11(tt + 4.0)) - 0.5) * jt;
  vec2 j2 = (vec2(hash11(tt + 5.0), hash11(tt + 6.0)) - 0.5) * jt;
  vec2 j3 = (vec2(hash11(tt + 7.0), hash11(tt + 8.0)) - 0.5) * jt;
  vec2 off = bilerp(tl * p_morph + j0, tr * p_morph + j1, br * p_morph + j2, bl * p_morph + j3, clamp(iuv, 0.0, 1.0));
  iuv -= off;
  if (int(p_morphShape + 0.5) == 3) iuv.y += sin(iuv.x * 9.0 - u_t * 4.0) * 0.06 * p_morph;
  // breathing ripple along the edges
  iuv += (vec2(noise(iuv * 6.0 + u_t * 0.8), noise(iuv * 6.0 + 7.0 - u_t * 0.8)) - 0.5) * 0.025 * p_breathe;
  // melt: the lower part drips downwards
  if (p_melt > 0.0){
    float drip = fbm(vec2(iuv.x * 7.0, 1.3)) * (0.7 + 0.3 * sin(u_t * 0.7 + iuv.x * 5.0));
    iuv.y -= drip * p_melt * 0.45 * smoothstep(0.2, 1.0, iuv.y);
  }
  // glitch: horizontal slices jump sideways
  float g = p_glitch + p_tension * 0.15;
  if (g > 0.0){
    float sl = floor(iuv.y * 18.0);
    float h = hash11(sl + tt * 7.13 + u_seed);
    if (h < g * 0.6) iuv.x += (hash11(sl * 1.7 + tt) - 0.5) * 0.35 * g;
  }
  return iuv;
}
float letterIndex(float u){ return u < 0.2415 ? 0.0 : u < 0.4304 ? 1.0 : u < 0.4838 ? 2.0 : u < 0.7243 ? 3.0 : 4.0; }
vec3 letterFx(vec3 inp, float amt, float idx, vec2 centreUv){
  int fx = int(p_letterFx + 0.5);
  // a curve so steady levels stay subtle and real hits punch through
  amt = clamp(amt, 0.0, 1.0);
  amt = amt * amt;
  if (fx == 0) return mix(inp, max(p_ink2, vec3(0.9)) * 1.2, amt * 0.85);
  if (fx == 1){ vec2 uv = centreUv + (v_uv - centreUv) / (1.0 + amt * 0.6); return texture(u_input, uv).rgb * (1.0 + amt * 0.3); }
  if (fx == 2) return mix(inp, 1.0 - inp, amt);
  if (fx == 3) return mix(inp, u_pal[int(mod(idx, 3.0))] * 1.1, amt);
  if (fx == 4) return hueShift(inp, amt * 0.5) * (1.0 + amt * 0.2);
  float sl = floor(v_uv.y * 40.0 + idx * 3.0);
  vec2 o = vec2((hash11(sl + floor(u_t * 15.0)) - 0.5) * 0.08 * amt, 0.0);
  return vec3(texture(u_input, v_uv + o).r, inp.g, texture(u_input, v_uv - o).b);
}
vec4 layer(){
  vec3 inp = texture(u_input, v_uv).rgb;
  vec2 centre = vec2(p_x * aspect() * 0.5, p_y * 0.5);
  vec2 p = centered(v_uv) - centre;
  p = rot(radians(p_rotate)) * p;
  float LW = min(aspect() * 0.92, 1.6) * p_scale * (1.0 + p_breathe * 0.05);
  float LH = LW / LA;
  vec2 iuv = vec2(p.x / LW + 0.5, 0.5 - p.y / LH);
  // shatter: the shape breaks into pieces that fly outwards, leaving gaps
  float gapMask = 1.0;
  if (p_shatter > 0.03){
    vec2 g = vec2(9.0, 4.0);
    vec2 cid = floor(iuv * g);
    vec2 h = hash22(cid + 4.7);
    vec2 dir = normalize((cid + 0.5) / g - 0.5 + (h - 0.5) * 0.4 + 0.0001);
    vec2 moved = iuv - dir * p_shatter * (0.15 + h.x * 0.35);
    vec2 fr = fract(moved * g) - 0.5;
    gapMask = step(max(abs(fr.x), abs(fr.y)), 0.5 - p_shatter * 0.12);
    iuv = moved;
  }
  vec2 wuv = warp(iuv);
  vec2 m = maskAt(wuv) * gapMask;
  float solid = m.r * (1.0 - m.g);
  float holes = m.r * m.g;
  // drop shadow on what is behind
  vec2 ms = maskAt(warp(iuv + vec2(-0.012, -0.035))) * gapMask;
  float shadow = ms.r * (1.0 - ms.g) * p_shadow;
  // second ink, printed slightly out of line
  vec2 mk = maskAt(warp(iuv + vec2(0.02, -0.03) * p_slip * 1.5)) * gapMask;
  float slipInk = mk.r * (1.0 - mk.g) * smoothstep(0.0, 0.15, p_slip);

  vec3 c = inp * (1.0 - p_outside * (1.0 - m.r) * 0.85);
  c *= 1.0 - shadow * 0.65 * (1.0 - m.r);
  // letter windows, each with its own part of the track
  float idx = letterIndex(wuv.x);
  float amt = idx < 0.5 ? p_s : idx < 1.5 ? p_k : idx < 2.5 ? p_i : idx < 3.5 ? p_m : p_o;
  c = mix(c, letterFx(inp, amt, idx, uncenter(centre)), holes);
  c = mix(c, p_ink2, slipInk * (1.0 - m.r) * 0.9);
  // the solid shape in flat ink with a little print texture
  float grain = (noise(wuv * vec2(420.0, 200.0)) - 0.5) * 0.18 + (fbm(wuv * vec2(8.0, 4.0)) - 0.5) * 0.25;
  vec3 ink = p_colour * (1.0 + grain * p_texture) * (1.0 + p_pulse * 0.6);
  c = mix(c, ink, solid);
  return vec4(c, 1.0);
}`
};
