import { LayerDef, f, sel, col, bool, mod, SPEED } from './types';

const BRIGHT = f('brightness', 'Brightness', 0, 3, 1, { group: 'Colour' });
const HUE = f('hue', 'Hue shift', -1, 1, 0, { group: 'Colour' });
const COLOURSPREAD = f('spread', 'Colour spread', 0, 2, 0.5, { group: 'Colour' });

export const GENERATORS: LayerDef[] = [
  {
    id: 'lightgrid', name: 'Light Grid', category: 'generator', tags: ['geometric', 'minimal', 'strobe'],
    description: 'Bars of light that scan, strobe and switch on and off. Great for minimal, architectural looks.',
    params: [
      f('count', 'Bars', 2, 64, 12, { step: 1 }),
      sel('orient', 'Direction', ['Vertical', 'Horizontal', 'Grid', 'Radial', 'Rings']),
      f('thickness', 'Thickness', 0.02, 1, 0.25),
      f('glow', 'Glow', 0, 1, 0.4),
      f('scan', 'Scan wave', 0, 1, 0.6, { group: 'Motion' }),
      f('pattern', 'Random on/off', 0, 1, 0.3, { group: 'Motion' }),
      f('rate', 'Pattern changes per beat', 0.25, 4, 1, { group: 'Motion' }),
      f('strobe', 'Flash', 0, 1, 0, { group: 'Motion' }),
      SPEED,
      sel('colourMode', 'Colour', ['Palette across bars', 'Single colour', 'White']),
      col('colour', 'Single colour', 'p0'),
      BRIGHT, HUE
    ],
    defaultMods: { strobe: mod('kick', 0.8, 0.15) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  float n = floor(p_count);
  int o = int(p_orient + 0.5);
  float coord = v_uv.x;
  if (o == 1) coord = v_uv.y;
  if (o == 3) coord = (atan(p.y, p.x) + PI) / TAU;
  if (o == 4) coord = length(p) * 1.2;
  float id = floor(coord * n);
  float fr = fract(coord * n);
  float soft = 0.004 + p_glow * 0.25;
  float half_ = p_thickness * 0.5;
  float line = 1.0 - smoothstep(half_, half_ + soft, abs(fr - 0.5));
  float glowL = exp(-abs(fr - 0.5) * (12.0 - p_glow * 9.0)) * p_glow * 0.6;
  if (o == 2){
    float id2 = floor(v_uv.y * n * 0.5625);
    float fr2 = fract(v_uv.y * n * 0.5625);
    float l2 = 1.0 - smoothstep(half_, half_ + soft, abs(fr2 - 0.5));
    line = max(line, l2); id += id2 * 7.0;
  }
  float step_ = floor(u_beat * p_rate);
  float on = mix(1.0, step(0.45, hash11(id * 3.17 + step_ * 11.3 + u_seed)), p_pattern);
  float scan = mix(1.0, 0.5 + 0.5 * sin(id * 0.9 - u_time * 4.0), p_scan);
  float b = (line + glowL) * on * scan;
  b += p_strobe * (line + glowL) * 1.5;
  vec3 c = vec3(1.0);
  int cm = int(p_colourMode + 0.5);
  if (cm == 0) c = pal(id / max(n, 1.0) + u_time * 0.03);
  else if (cm == 1) c = p_colour;
  c = hueShift(c, p_hue) * b * p_brightness;
  return vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}`
  },
  {
    id: 'tunnel', name: 'Tunnel', category: 'generator', tags: ['tunnel', 'hypnotic', 'rave'],
    description: 'An endless tunnel of rings and lines rushing towards you.',
    params: [
      sel('shape', 'Shape', ['Circle', 'Square', 'Hexagon', 'Triangle']),
      f('rings', 'Rings', 1, 20, 6),
      f('segments', 'Segments', 0, 24, 8, { step: 1 }),
      f('lineWidth', 'Line width', 0.01, 0.5, 0.12),
      f('twist', 'Twist', -2, 2, 0.3),
      f('spin', 'Spin', -2, 2, 0.1, { group: 'Motion' }),
      SPEED,
      f('pulse', 'Pulse', 0, 1, 0, { group: 'Motion' }),
      f('fog', 'Depth fade', 0, 1, 0.6),
      f('fill', 'Fill', 0, 1, 0.15),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { pulse: mod('kick', 0.5, 0.2) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv) * (1.0 - p_pulse * 0.25);
  p = rot(u_spin * 0.5) * p;
  int s = int(p_shape + 0.5);
  float r = length(p);
  if (s == 1) r = max(abs(p.x), abs(p.y));
  else if (s == 2) r = sdPoly(p, 6.0);
  else if (s == 3) r = sdPoly(p, 3.0);
  r = max(r, 0.001);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float depth = 0.25 / r + u_time * 0.6;
  float ring = abs(fract(depth * p_rings * 0.25) - 0.5);
  float lw = p_lineWidth * 0.5;
  float rings = 1.0 - smoothstep(lw, lw + 0.06, ring);
  float seg = 0.0;
  if (p_segments >= 1.0){
    float sa = abs(fract(a * floor(p_segments) + depth * p_twist) - 0.5);
    seg = 1.0 - smoothstep(lw * 0.5, lw * 0.5 + 0.05, sa);
  }
  float b = max(rings, seg) + p_fill * 0.5;
  float fog = mix(1.0, smoothstep(0.0, 0.35, r), p_fog);
  vec3 c = pal(depth * 0.1 * p_spread + floor(depth * p_rings * 0.25) * 0.13 * p_spread);
  c = hueShift(c, p_hue) * b * fog * p_brightness * (1.0 + p_pulse);
  return vec4(c, 1.0);
}`
  },
  {
    id: 'liquid', name: 'Liquid', category: 'generator', tags: ['liquid', 'dreamy', 'lofi', 'organic'],
    description: 'Slow flowing liquid colour, like oil on water. Lovely with pastel palettes.',
    params: [
      f('scale', 'Scale', 0.2, 6, 1.6),
      f('warp', 'Warp', 0, 3, 1.2),
      SPEED,
      f('flow', 'Flow direction', 0, 1, 0.3, { group: 'Motion' }),
      f('contrast', 'Contrast', 0.3, 3, 1),
      f('bands', 'Banding', 0, 1, 0),
      f('ripple', 'Ripple', 0, 1, 0, { group: 'Motion' }),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { ripple: mod('bass', 0.3, 0.3) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv) * p_scale;
  float t = u_time * 0.15;
  p += vec2(cos(p_flow * TAU), sin(p_flow * TAU)) * t * 0.5;
  p += p_ripple * 0.3 * sin(length(p) * 8.0 - u_time * 3.0) * normalize(p + 0.0001);
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + p_warp * 2.0 * q + vec2(1.7, 9.2) + 0.7 * t), fbm(p + p_warp * 2.0 * q + vec2(8.3, 2.8) - 0.4 * t));
  float v = fbm(p + p_warp * 2.0 * r);
  v = clamp((v - 0.5) * p_contrast + 0.5, 0.0, 1.0);
  if (p_bands > 0.0) v = mix(v, floor(v * 8.0) / 8.0, p_bands);
  vec3 c = pal(v * p_spread * 2.0 + length(q) * 0.3 + u_time * 0.02);
  c *= 0.55 + v * 0.8;
  c = hueShift(c, p_hue) * p_brightness;
  return vec4(c, 1.0);
}`
  },
  {
    id: 'fractal', name: 'Fractal', category: 'generator', tags: ['fractal', 'psychedelic', 'cosmic'],
    description: 'An ever changing fractal pattern with built in mirror symmetry.',
    params: [
      f('zoom', 'Zoom', 0.2, 4, 1.2),
      f('iterations', 'Detail', 3, 14, 9, { step: 1 }),
      f('morph', 'Morph', 0, 1, 0.5),
      f('drift', 'Morph drift', 0, 1, 0.3, { group: 'Motion' }),
      f('spin', 'Spin', -2, 2, 0.1, { group: 'Motion' }),
      SPEED,
      f('symmetry', 'Mirror symmetry', 0, 12, 0, { step: 1 }),
      f('glow', 'Glow', 0, 2, 1),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { glow: mod('kick', 0.25, 0.2) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  p = rot(u_spin * 0.3) * p;
  if (p_symmetry >= 2.0){ float n = floor(p_symmetry); float a = atan(p.y, p.x); float r = length(p); float s = TAU / n; a = abs(mod(a + s * 0.5, s) - s * 0.5); p = vec2(cos(a), sin(a)) * r; }
  p /= p_zoom;
  vec2 c = vec2(-0.52, -0.6) + vec2(p_morph * 0.35, p_morph * 0.25) + vec2(sin(u_time * 0.13), cos(u_time * 0.11)) * 0.08 * p_drift;
  vec2 z = p;
  float acc = 0.0; float minD = 10.0;
  int it = int(p_iterations);
  for (int i = 0; i < 14; i++){
    if (i >= it) break;
    z = abs(z) / max(dot(z, z), 0.0005) + c;
    float d = length(z);
    acc += exp(-d * 1.5);
    minD = min(minD, abs(z.y));
  }
  float v = acc / float(it);
  float g = exp(-minD * 8.0) * p_glow;
  float shade = smoothstep(0.0, 0.6, v);
  vec3 col = pal(v * p_spread * 3.0 + u_time * 0.02) * shade * shade * 1.1 + pal(v * 2.0 + 0.5) * g * 0.35;
  col = hueShift(col, p_hue) * p_brightness;
  return vec4(col, 1.0);
}`
  },
  {
    id: 'particles', name: 'Particles', category: 'generator', tags: ['particles', 'cosmic', 'rave'],
    description: 'Stars and sparks flying through space, drifting or bursting outwards.',
    params: [
      sel('mode', 'Mode', ['Warp speed', 'Drift', 'Snow', 'Rise']),
      f('density', 'Density', 0.1, 1, 0.6),
      f('size', 'Size', 0.2, 4, 1),
      f('trails', 'Trails', 0, 1, 0.4),
      SPEED,
      f('boost', 'Speed boost', 0, 3, 0, { group: 'Motion' }),
      f('twinkle', 'Twinkle', 0, 1, 0.3),
      sel('colourMode', 'Colour', ['Palette', 'Single colour', 'White']),
      col('colour', 'Single colour', 'p1'),
      BRIGHT
    ],
    defaultMods: { boost: mod('kick', 0.4, 0.25) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  vec3 acc = vec3(0.0);
  int mode = int(p_mode + 0.5);
  int cm = int(p_colourMode + 0.5);
  float t = u_time;
  for (int L = 0; L < 6; L++){
    float fl = float(L);
    vec3 tint = cm == 0 ? pal(fl * 0.17 + 0.1) : (cm == 1 ? p_colour : vec3(1.0));
    if (mode == 0){
      float depth = fract(fl / 6.0 + t * 0.12);
      float sc = mix(28.0, 0.6, depth);
      vec2 q = p * sc + fl * 17.3;
      vec2 id = floor(q); vec2 fq = fract(q) - 0.5;
      vec2 off = (hash22(id + fl) - 0.5) * 0.7;
      float exist = step(1.0 - p_density, hash21(id * 1.3 + fl));
      vec2 d = fq - off;
      vec2 dir = normalize(p + 0.0001);
      float along = dot(d, dir); float across = length(d - dir * along);
      float stretch = 1.0 + p_trails * 6.0 * depth + p_boost * 4.0;
      float dist = length(vec2(across, along / stretch));
      float star = smoothstep(0.06 * p_size, 0.0, dist) * exist;
      float fade = smoothstep(0.0, 0.25, depth) * smoothstep(1.0, 0.85, depth);
      float tw = mix(1.0, 0.5 + 0.5 * sin(t * 6.0 + hash21(id) * 30.0), p_twinkle);
      acc += tint * star * fade * tw;
    } else {
      float sc = 6.0 + fl * 4.0;
      vec2 vel = mode == 1 ? vec2(0.3, 0.1) : (mode == 2 ? vec2(0.05, -0.5) : vec2(0.0, 0.5));
      vec2 q = p * sc + vel * t * (1.0 + fl * 0.3) * (1.0 + p_boost) + fl * 13.1;
      vec2 id = floor(q); vec2 fq = fract(q) - 0.5;
      vec2 off = (hash22(id + fl) - 0.5) * 0.6;
      off += vec2(sin(t + hash21(id) * 20.0), cos(t * 0.7 + hash21(id + 3.0) * 20.0)) * 0.1;
      float exist = step(1.0 - p_density, hash21(id * 1.7 + fl));
      vec2 d = fq - off;
      float dist = length(vec2(d.x, d.y / (1.0 + p_trails * 3.0 * float(mode != 1))));
      float star = smoothstep(0.08 * p_size, 0.0, dist) * exist * (1.0 - fl * 0.1);
      float tw = mix(1.0, 0.5 + 0.5 * sin(t * 5.0 + hash21(id) * 30.0), p_twinkle);
      acc += tint * star * tw;
    }
  }
  acc *= p_brightness;
  return vec4(acc, clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0));
}`
  },
  {
    id: 'shapes', name: 'Geometric Rings', category: 'generator', tags: ['geometric', 'minimal', 'hypnotic'],
    description: 'Nested polygons that rotate, pulse and ripple outwards.',
    params: [
      f('sides', 'Sides', 3, 12, 4, { step: 1 }),
      f('rings', 'Rings', 1, 30, 8),
      f('thickness', 'Thickness', 0.01, 0.9, 0.15),
      f('twist', 'Twist per ring', -1, 1, 0.1),
      f('spin', 'Spin', -2, 2, 0.2, { group: 'Motion' }),
      SPEED,
      f('pulse', 'Pulse', 0, 1, 0, { group: 'Motion' }),
      f('fill', 'Alternate fill', 0, 1, 0),
      f('glow', 'Glow', 0, 1, 0.3),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { pulse: mod('kick', 0.6, 0.2) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv) * (1.0 - p_pulse * 0.2);
  float r0 = length(p);
  float ringIdx = floor(r0 * p_rings * 1.4 - u_time * 0.5);
  p = rot(u_spin * 0.4 + ringIdx * p_twist) * p;
  float d = sdPoly(p, floor(p_sides));
  float x = d * p_rings * 1.4 - u_time * 0.5;
  float id = floor(x);
  float fr = abs(fract(x) - 0.5);
  float line = 1.0 - smoothstep(p_thickness * 0.5, p_thickness * 0.5 + 0.03 + p_glow * 0.1, fr);
  float glow = exp(-fr * 10.0) * p_glow * 0.5;
  float fillv = p_fill * step(0.5, mod(id, 2.0)) * 0.6;
  vec3 c = pal(id * 0.08 * p_spread * 2.0 + u_time * 0.02);
  c = hueShift(c, p_hue) * (line + glow + fillv) * p_brightness * (1.0 + p_pulse * 0.6);
  return vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}`
  },
  {
    id: 'spectrum', name: 'Spectrum', category: 'generator', tags: ['spectrum', 'audio'],
    description: 'A frequency spectrum display driven directly by your track.',
    params: [
      sel('mode', 'Style', ['Bars', 'Mirrored bars', 'Circle', 'Line']),
      f('bars', 'Bars', 8, 128, 48, { step: 1 }),
      f('height', 'Height', 0.1, 2, 0.8),
      f('gap', 'Gap', 0, 0.9, 0.3),
      f('radius', 'Circle radius', 0.05, 0.5, 0.22),
      f('y', 'Vertical position', -0.5, 0.5, 0),
      f('glow', 'Glow', 0, 1, 0.3),
      sel('colourMode', 'Colour', ['Palette across bars', 'Single colour', 'White']),
      col('colour', 'Single colour', 'p0'),
      BRIGHT
    ],
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  int m = int(p_mode + 0.5);
  float n = floor(p_bars);
  float b = 0.0; float x = 0.0;
  if (m == 2){
    float a = atan(p.x, p.y) / TAU + 0.5;
    float r = length(p);
    x = abs(a * 2.0 - 1.0);
    float id = floor(x * n * 0.5) / (n * 0.5);
    float v = spec(id);
    float inGap = step(p_gap * 0.5, abs(fract(x * n * 0.5) - 0.5) * -1.0 + 0.5);
    float edge = p_radius + v * p_height * 0.35;
    b = step(p_radius, r) * (1.0 - smoothstep(edge, edge + 0.004, r)) * inGap;
    b += exp(-max(0.0, r - edge) * 30.0) * p_glow * step(p_radius, r) * 0.5;
    x = id;
  } else {
    float yy = v_uv.y - 0.5 - p_y;
    x = m == 1 ? abs(v_uv.x * 2.0 - 1.0) : v_uv.x;
    float id = floor(x * n) / n;
    float v = spec(m == 3 ? x : id);
    float h = v * p_height * 0.5;
    if (m == 3){
      float dy = abs(yy - (v - 0.3) * p_height * 0.4);
      b = smoothstep(0.006 + p_glow * 0.02, 0.0, dy) + exp(-dy * 60.0) * p_glow;
    } else {
      float inGap = step(p_gap * 0.5, 0.5 - abs(fract(x * n) - 0.5));
      float yb = m == 1 ? abs(yy) : yy + 0.5;
      b = (1.0 - smoothstep(h, h + 0.004, yb)) * step(0.0, yb) * inGap;
      b += exp(-max(0.0, yb - h) * 40.0) * p_glow * inGap * 0.6 * step(0.0, yb);
    }
    x = id;
  }
  int cm = int(p_colourMode + 0.5);
  vec3 c = cm == 0 ? pal(x * 0.9) : (cm == 1 ? p_colour : vec3(1.0));
  c *= b * p_brightness;
  return vec4(c, clamp(b, 0.0, 1.0));
}`
  },
  {
    id: 'gradient', name: 'Colour Aura', category: 'generator', tags: ['dreamy', 'lofi', 'soft', 'background'],
    description: 'Glowing pools of colour drifting through darkness, with film grain. A rich, moody background.',
    params: [
      f('size', 'Glow size', 0.1, 1.5, 0.45),
      f('depth', 'Darkness', 0, 1, 0.65),
      f('count', 'Glows', 1, 6, 4, { step: 1 }),
      SPEED,
      f('breathe', 'Breathe', 0, 1, 0, { group: 'Motion' }),
      f('flare', 'Flare', 0, 1, 0, { group: 'Motion' }),
      f('grain', 'Grain', 0, 0.5, 0.08),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { breathe: mod('bass', 0.5, 0.3), flare: mod('kick', 0.35, 0.25) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  vec3 col = u_pal[3] * (1.0 - p_depth) * 0.6;
  int n = int(p_count);
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float fi = float(i);
    vec2 c = vec2(sin(u_time * 0.13 * (1.0 + fi * 0.37) + fi * 2.1) * 0.55 * aspect(), cos(u_time * 0.1 * (1.0 + fi * 0.23) + fi * 1.3) * 0.4);
    float r = (0.6 + 0.5 * hash11(fi + 1.0)) * p_size * (1.0 + p_breathe * 0.35);
    float d = length(p - c) / r;
    float glow = exp(-d * d * 2.2);
    vec3 tint = u_pal[int(mod(fi, 3.0))];
    tint = mix(tint, pal(fi * 0.33 * p_spread + 0.1), 0.35);
    col += tint * glow * (0.85 + p_flare * 0.8) * (1.0 - p_depth * 0.35);
  }
  float vig = smoothstep(1.3, 0.2, length(p));
  col *= mix(1.0, vig, p_depth);
  col += (hash21(v_uv * u_res + fract(u_t * 7.0) * 91.0) - 0.5) * p_grain;
  col = hueShift(max(col, 0.0), p_hue) * p_brightness;
  return vec4(col, 1.0);
}`
  },
  {
    id: 'retrogrid', name: 'Retro Grid', category: 'generator', tags: ['retro', 'synthwave'],
    description: 'An 80s style neon grid floor racing towards a striped sun.',
    params: [
      SPEED,
      f('density', 'Grid density', 2, 30, 10),
      f('horizon', 'Horizon height', -0.3, 0.4, 0.05),
      f('sun', 'Sun size', 0, 0.6, 0.28),
      f('stripes', 'Sun stripes', 0, 20, 8, { step: 1 }),
      f('lineWidth', 'Line width', 0.005, 0.2, 0.04),
      f('glow', 'Glow', 0, 1, 0.5),
      f('bounce', 'Bounce', 0, 1, 0, { group: 'Motion' }),
      col('gridColour', 'Grid colour', 'p0'),
      col('sunTop', 'Sun top', 'p2'),
      col('sunBottom', 'Sun bottom', 'p1'),
      col('sky', 'Sky', 'p3'),
      BRIGHT
    ],
    defaultMods: { bounce: mod('kick', 0.5, 0.2) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  float hz = p_horizon + p_bounce * 0.03;
  vec3 col = p_sky * (0.25 + 0.6 * smoothstep(0.6, hz, p.y));
  if (p.y > hz){
    vec2 sp = p - vec2(0.0, hz + p_sun * 0.55);
    float sd = length(sp);
    float sunMask = smoothstep(p_sun, p_sun - 0.005, sd);
    float sy = (sp.y + p_sun) / (2.0 * p_sun + 0.0001);
    float stripe = p_stripes > 0.5 ? step(0.5 * (1.0 - sy) * 0.9, abs(fract(sy * p_stripes - u_time * 0.2) - 0.5)) : 1.0;
    stripe = mix(1.0, stripe, smoothstep(0.7, 0.3, sy));
    vec3 sun = mix(p_sunBottom, p_sunTop, clamp(sy, 0.0, 1.0));
    col = mix(col, sun, sunMask * stripe);
    col += sun * exp(-max(sd - p_sun, 0.0) * 8.0) * p_glow * 0.5;
  } else {
    float d = hz - p.y;
    float z = 0.4 / max(d, 0.001);
    float gx = p.x * z;
    float gz = z + u_time * 2.0;
    float lw = p_lineWidth * z * 0.6;
    float lx = abs(fract(gx * p_density * 0.1) - 0.5) / (p_density * 0.1);
    float lz = abs(fract(gz * p_density * 0.1) - 0.5) / (p_density * 0.1);
    float g = smoothstep(lw, 0.0, lx) + smoothstep(lw, 0.0, lz);
    g += (exp(-lx * 30.0 / z) + exp(-lz * 30.0 / z)) * p_glow * 0.3;
    float fade = smoothstep(0.0, 0.25, d);
    col = mix(vec3(0.0), p_sky * 0.15, 1.0 - fade) + p_gridColour * g * fade;
    col += p_gridColour * exp(-d * 30.0) * p_glow;
  }
  return vec4(col * p_brightness, 1.0);
}`
  },
  {
    id: 'lasers', name: 'Laser Beams', category: 'generator', tags: ['rave', 'lasers', 'strobe'],
    description: 'Club style laser beams fanning and sweeping through haze.',
    params: [
      f('count', 'Beams', 1, 40, 12, { step: 1 }),
      f('spread', 'Fan spread', 0, 1, 0.6),
      f('sweep', 'Sweep amount', 0, 1, 0.5, { group: 'Motion' }),
      SPEED,
      f('width', 'Beam width', 0.001, 0.05, 0.006),
      sel('origin', 'Origin', ['Bottom', 'Top', 'Centre', 'Both sides']),
      f('haze', 'Haze', 0, 1, 0.4),
      f('flash', 'Flash', 0, 1, 0, { group: 'Motion' }),
      sel('colourMode', 'Colour', ['Palette', 'Single colour']),
      col('colour', 'Single colour', 'p0'),
      BRIGHT
    ],
    defaultMods: { flash: mod('snare', 0.6, 0.15) },
    glsl: `
vec3 beams(vec2 p, vec2 o, float baseAng){
  vec2 d = p - o;
  float ang = atan(d.x, d.y);
  float n = floor(p_count);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++){
    if (float(i) >= n) break;
    float fi = float(i);
    float k = n > 1.0 ? fi / (n - 1.0) - 0.5 : 0.0;
    float a = baseAng + k * p_spread * 2.4 + sin(u_time * 1.3 + fi * 0.4) * p_sweep * 0.6;
    float da = abs(atan(sin(ang - a), cos(ang - a)));
    float dist = da * length(d);
    float beam = exp(-dist / p_width) + exp(-dist / (p_width * 8.0)) * 0.25;
    vec3 c = int(p_colourMode + 0.5) == 0 ? pal(fi / max(n, 1.0) + u_time * 0.05) : p_colour;
    acc += c * beam;
  }
  return acc;
}
vec4 layer(){
  vec2 p = centered(v_uv);
  int o = int(p_origin + 0.5);
  vec3 c = vec3(0.0);
  if (o == 0) c = beams(p, vec2(0.0, -0.55), 0.0);
  else if (o == 1) c = beams(p, vec2(0.0, 0.55), PI);
  else if (o == 2) c = beams(p, vec2(0.0), u_time * 0.2) + beams(p, vec2(0.0), PI + u_time * 0.2);
  else c = beams(p, vec2(-aspect() * 0.5 - 0.05, -0.2), 1.2) + beams(p, vec2(aspect() * 0.5 + 0.05, -0.2), -1.2);
  float haze = fbm(p * 3.0 + vec2(u_time * 0.1, 0.0)) * p_haze;
  c *= 0.6 + haze;
  c += c * p_flash * 2.0;
  c *= p_brightness;
  return vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
}`
  },
  {
    id: 'contours', name: 'Contour Lines', category: 'generator', tags: ['minimal', 'organic', 'lines'],
    description: 'Flowing topographic lines, like a living map.',
    params: [
      f('scale', 'Scale', 0.3, 6, 1.5),
      f('density', 'Line density', 2, 40, 14),
      f('width', 'Line width', 0.02, 0.5, 0.12),
      SPEED,
      f('wobble', 'Wobble', 0, 1, 0, { group: 'Motion' }),
      bool('filled', 'Fill between lines', false),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { wobble: mod('bass', 0.4, 0.3) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv) * p_scale;
  float v = fbm(p + vec2(u_time * 0.07, -u_time * 0.05) + fbm(p * 2.0 + u_time * 0.1) * (0.5 + p_wobble));
  float x = v * p_density;
  float fr = abs(fract(x) - 0.5);
  float line = 1.0 - smoothstep(p_width * 0.5, p_width * 0.5 + 0.08, fr);
  vec3 c = pal(floor(x) * 0.07 * p_spread * 2.0 + u_time * 0.01);
  vec3 outc = c * line;
  if (p_filled > 0.5) outc = mix(c * 0.35, c, line);
  outc = hueShift(outc, p_hue) * p_brightness;
  return vec4(outc, p_filled > 0.5 ? 1.0 : clamp(line, 0.0, 1.0));
}`
  },
  {
    id: 'dots', name: 'Dot Matrix', category: 'generator', tags: ['geometric', 'minimal', 'led'],
    description: 'A grid of dots that swell and ripple like an LED wall.',
    params: [
      f('cells', 'Dots across', 6, 120, 40, { step: 1 }),
      sel('pattern', 'Pattern', ['Ripple', 'Noise', 'Scan', 'Spectrum', 'Checker pulse']),
      f('size', 'Dot size', 0.1, 1, 0.8),
      f('freq', 'Wave frequency', 0.5, 20, 6),
      SPEED,
      f('pump', 'Pump', 0, 1, 0, { group: 'Motion' }),
      bool('square', 'Square dots', false),
      COLOURSPREAD, BRIGHT, HUE
    ],
    defaultMods: { pump: mod('kick', 0.5, 0.2) },
    glsl: `
vec4 layer(){
  float n = floor(p_cells);
  vec2 g = v_uv * vec2(n, n / aspect());
  vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
  vec2 cuv = (id + 0.5) / vec2(n, n / aspect());
  vec2 cp = centered(cuv);
  int pat = int(p_pattern + 0.5);
  float v = 0.0;
  if (pat == 0) v = 0.5 + 0.5 * sin(length(cp) * p_freq * 3.0 - u_time * 3.0);
  else if (pat == 1) v = fbm(cp * p_freq * 0.5 + u_time * 0.2);
  else if (pat == 2) v = 0.5 + 0.5 * sin(cuv.x * p_freq * 2.0 - u_time * 4.0) ;
  else if (pat == 3) v = step(1.0 - spec(cuv.x), cuv.y) * 0.9 + 0.1;
  else v = mod(id.x + id.y + floor(u_beat), 2.0);
  v = clamp(v + p_pump * 0.5, 0.0, 1.0);
  float r = v * p_size * 0.5;
  float d = p_square > 0.5 ? max(abs(fr.x), abs(fr.y)) : length(fr);
  float dot_ = smoothstep(r, r - 0.08, d);
  vec3 c = pal(v * p_spread + length(cp) * 0.3 * p_spread);
  c = hueShift(c, p_hue) * dot_ * p_brightness * (0.4 + v);
  return vec4(c, dot_);
}`
  },
  {
    id: 'solid', name: 'Solid / Gradient', category: 'generator', tags: ['background'],
    description: 'A flat colour or simple gradient. Handy as a background.',
    params: [
      sel('mode', 'Type', ['Solid', 'Vertical gradient', 'Horizontal gradient', 'Radial gradient']),
      col('colourA', 'Colour A', 'p3'),
      col('colourB', 'Colour B', 'p0'),
      f('angleShift', 'Gradient shift', -1, 1, 0),
      BRIGHT
    ],
    glsl: `
vec4 layer(){
  int m = int(p_mode + 0.5);
  float t = 0.0;
  if (m == 1) t = v_uv.y; else if (m == 2) t = v_uv.x; else if (m == 3) t = length(centered(v_uv)) * 1.6;
  t = clamp(t + p_angleShift, 0.0, 1.0);
  vec3 c = m == 0 ? p_colourA : mix(p_colourA, p_colourB, t);
  return vec4(c * p_brightness, 1.0);
}`
  }
];
