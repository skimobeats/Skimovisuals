import { LayerDef, f, sel, col, bool, mod } from './types';

// Effects take everything underneath them (u_input) and transform it.
export const EFFECTS: LayerDef[] = [
  {
    id: 'kaleido', name: 'Kaleidoscope', category: 'effect', tags: ['psychedelic', 'hypnotic'],
    description: 'Mirrors everything below into a kaleidoscope that pulses, twists and snaps round with the music.',
    params: [
      f('segments', 'Segments', 2, 24, 6),
      f('spin', 'Spin', -2, 2, 0.15, { group: 'Motion' }),
      sel('step', 'Snap round one segment on', ['Off', 'Each kick', 'Each snare', 'Each beat', 'Each bar', 'Each section'], 1, { group: 'Motion' }),
      f('twist', 'Twist', -1, 1, 0, { group: 'Motion' }),
      f('rotate', 'Rotation', 0, 1, 0),
      f('zoom', 'Zoom', 0.2, 4, 1),
      f('swirl', 'Swirl', -1, 1, 0),
      f('offsetX', 'Centre X', -0.5, 0.5, 0),
      f('offsetY', 'Centre Y', -0.5, 0.5, 0)
    ],
    defaultMods: { zoom: mod('kick', 0.12, 0.2), twist: mod('snare', 0.35, 0.25), swirl: mod('bass', 0.25, 0.3) },
    glsl: `
vec3 kal(vec2 p, float n){
  float s = TAU / n;
  float a = atan(p.y, p.x) + u_spin * 0.5 + p_rotate * TAU + u_step * s + p_twist * 0.6;
  float r = length(p) / p_zoom;
  a += p_swirl * r * 3.0;
  a = mod(a, s); a = abs(a - s * 0.5);
  vec2 uv = uncenter(vec2(cos(a), sin(a)) * r);
  uv = abs(mod(uv - 1.0, 2.0) - 1.0);
  return texture(u_input, uv).rgb;
}
vec4 layer(){
  vec2 p = centered(v_uv) - vec2(p_offsetX, p_offsetY);
  float n = max(2.0, p_segments);
  float lo = floor(n);
  float f = n - lo;
  vec3 c = kal(p, lo);
  if (f > 0.001) c = mix(c, kal(p, lo + 1.0), smoothstep(0.0, 1.0, f));
  return vec4(c, 1.0);
}`
  },
  {
    id: 'mirror', name: 'Mirror', category: 'effect', tags: ['geometric'],
    description: 'Simple mirror symmetry.',
    params: [sel('mode', 'Mode', ['Left to right', 'Right to left', 'Top to bottom', 'Bottom to top', 'Four way'])],
    glsl: `
vec4 layer(){
  vec2 uv = v_uv; int m = int(p_mode + 0.5);
  if (m == 0 || m == 4) uv.x = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  if (m == 1) uv.x = uv.x < 0.5 ? 1.0 - uv.x : uv.x;
  if (m == 2 || m == 4) uv.y = uv.y < 0.5 ? 1.0 - uv.y : uv.y;
  if (m == 3) uv.y = uv.y > 0.5 ? 1.0 - uv.y : uv.y;
  return vec4(texture(u_input, uv).rgb, 1.0);
}`
  },
  {
    id: 'rgbsplit', name: 'RGB Split', category: 'effect', tags: ['glitch'],
    description: 'Pulls the red, green and blue channels apart.',
    params: [
      f('amount', 'Amount', 0, 1, 0.1),
      f('angle', 'Angle', 0, 1, 0),
      bool('radial', 'From centre', false)
    ],
    defaultMods: { amount: mod('snare', 0.4, 0.15) },
    glsl: `
vec4 layer(){
  vec2 dir = vec2(cos(p_angle * TAU), sin(p_angle * TAU)) * p_amount * 0.05;
  if (p_radial > 0.5) dir = (v_uv - 0.5) * p_amount * 0.1;
  float r = texture(u_input, v_uv + dir).r;
  float g = texture(u_input, v_uv).g;
  float b = texture(u_input, v_uv - dir).b;
  return vec4(r, g, b, 1.0);
}`
  },
  {
    id: 'glitch', name: 'Glitch', category: 'effect', tags: ['glitch'],
    description: 'Digital corruption: shifting blocks, torn slices and colour errors.',
    params: [
      f('amount', 'Amount', 0, 1, 0.3),
      f('blocks', 'Block size', 2, 60, 16),
      f('slices', 'Slice tearing', 0, 1, 0.5),
      f('colour', 'Colour corruption', 0, 1, 0.3),
      f('rate', 'Changes per second', 1, 30, 12)
    ],
    defaultMods: { amount: mod('snare', 0.5, 0.2) },
    glsl: `
vec4 layer(){
  float tt = floor(u_t * p_rate) + u_seed;
  vec2 uv = v_uv;
  vec2 bid = floor(uv * vec2(p_blocks, p_blocks * 0.6));
  float h = hash21(bid + tt);
  if (h < p_amount * 0.4) uv += (hash22(bid + tt * 1.3) - 0.5) * 0.15 * p_amount;
  float sl = floor(uv.y * 40.0);
  float hs = hash11(sl + tt * 7.0);
  if (hs < p_slices * p_amount * 0.5) uv.x += (hash11(sl + tt) - 0.5) * 0.3 * p_amount;
  vec3 c;
  float off = p_amount * 0.02 * step(0.5, hash11(tt));
  c.r = texture(u_input, uv + vec2(off, 0.0)).r;
  c.g = texture(u_input, uv).g;
  c.b = texture(u_input, uv - vec2(off, 0.0)).b;
  if (hash21(bid * 1.7 + tt) < p_colour * p_amount * 0.3) c = c.gbr;
  if (hash21(bid * 2.3 + tt) < p_colour * p_amount * 0.15) c = 1.0 - c;
  return vec4(c, 1.0);
}`
  },
  {
    id: 'datamosh', name: 'Datamosh', category: 'effect', feedback: true, tags: ['glitch'],
    description: 'Smears pixels along with movement like a broken video file. Builds up over time.',
    params: [
      f('amount', 'Smear', 0, 1, 0.7),
      f('blocks', 'Block size', 4, 80, 24),
      f('motion', 'Drift strength', 0, 1, 0.4),
      f('refresh', 'Refresh', 0, 1, 0.1)
    ],
    defaultMods: { refresh: mod('kick', 0.8, 0.1) },
    glsl: `
vec4 layer(){
  vec2 bid = floor(v_uv * vec2(p_blocks, p_blocks * 0.6));
  float tt = floor(u_t * 8.0);
  vec2 mv = (hash22(bid + floor(u_t * 2.0)) - 0.5) * 0.02 * p_motion;
  vec3 prev = texture(u_prev, v_uv - mv).rgb;
  vec3 cur = texture(u_input, v_uv).rgb;
  float keep = step(p_refresh, hash21(bid + tt)) * p_amount;
  float diff = length(cur - prev);
  keep *= smoothstep(0.9, 0.2, diff * (1.0 - p_amount * 0.8));
  return vec4(mix(cur, prev, keep), 1.0);
}`
  },
  {
    id: 'vhs', name: 'VHS', category: 'effect', tags: ['retro', 'lofi'],
    description: 'Old tape look: wobble, scanlines, colour bleed and noise.',
    params: [
      f('wobble', 'Wobble', 0, 1, 0.3),
      f('scanlines', 'Scanlines', 0, 1, 0.4),
      f('bleed', 'Colour bleed', 0, 1, 0.5),
      f('noise', 'Noise', 0, 1, 0.25),
      f('tracking', 'Tracking errors', 0, 1, 0.2),
      f('saturation', 'Saturation', 0, 2, 0.9)
    ],
    glsl: `
vec4 layer(){
  vec2 uv = v_uv;
  uv.x += sin(uv.y * 30.0 + u_t * 3.0) * 0.002 * p_wobble + (noise(vec2(uv.y * 80.0, u_t * 10.0)) - 0.5) * 0.004 * p_wobble;
  float band = fract(u_t * 0.15);
  float tr = smoothstep(0.03, 0.0, abs(uv.y - band)) * p_tracking;
  uv.x += tr * (hash11(floor(uv.y * 200.0) + u_t) - 0.5) * 0.08;
  float b = p_bleed * 0.006;
  vec3 c;
  c.r = texture(u_input, uv + vec2(b, 0.0)).r;
  c.g = texture(u_input, uv).g;
  c.b = texture(u_input, uv - vec2(b, 0.0)).b;
  c = mix(c, (texture(u_input, uv + vec2(b * 2.0, 0.0)).rgb + c) * 0.5, p_bleed * 0.5);
  float sl = 0.5 + 0.5 * sin(v_uv.y * u_res.y * 1.0);
  c *= 1.0 - p_scanlines * 0.35 * sl;
  c += (hash21(v_uv * u_res + fract(u_t) * 100.0) - 0.5) * p_noise * 0.3;
  c += tr * 0.3;
  c = saturate3(c, p_saturation);
  return vec4(c, 1.0);
}`
  },
  {
    id: 'feedback', name: 'Trails / Feedback', category: 'effect', feedback: true, tags: ['hypnotic', 'psychedelic', 'trails'],
    description: 'Leaves echoes of previous frames that zoom, spin and fade.',
    params: [
      f('decay', 'Trail length', 0, 0.99, 0.85),
      f('zoom', 'Zoom', -0.1, 0.1, 0.02),
      f('rotate', 'Rotate', -0.1, 0.1, 0.005),
      f('shiftX', 'Drift X', -0.02, 0.02, 0),
      f('shiftY', 'Drift Y', -0.02, 0.02, 0),
      f('hue', 'Colour shift per frame', -0.1, 0.1, 0.01),
      sel('mode', 'Mix', ['Brightest', 'Add', 'Blend'])
    ],
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  p = rot(p_rotate) * p / (1.0 + p_zoom);
  vec2 uv = uncenter(p) - vec2(p_shiftX, p_shiftY);
  vec3 prev = texture(u_prev, uv).rgb;
  prev = hueShift(prev, p_hue) * p_decay;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) prev = vec3(0.0);
  vec3 cur = texture(u_input, v_uv).rgb;
  int m = int(p_mode + 0.5);
  vec3 c = m == 0 ? max(cur, prev) : (m == 1 ? cur + prev * 0.5 : mix(cur, prev, p_decay * 0.9));
  return vec4(min(c, vec3(4.0)), 1.0);
}`
  },
  {
    id: 'bloom', name: 'Glow', category: 'effect', tags: ['glow'],
    description: 'Makes bright areas bloom and glow.',
    params: [
      f('threshold', 'Threshold', 0, 1, 0.5),
      f('radius', 'Radius', 0.5, 8, 3),
      f('intensity', 'Intensity', 0, 3, 1)
    ],
    glsl: `
vec4 layer(){
  vec3 base = texture(u_input, v_uv).rgb;
  vec3 acc = vec3(0.0); float w = 0.0;
  vec2 px = p_radius / u_res * (u_res.y / 540.0);
  for (int i = 0; i < 24; i++){
    float fi = float(i);
    float a = fi * 2.39996;
    float r = sqrt(fi + 0.5) / sqrt(24.0);
    vec2 o = vec2(cos(a), sin(a)) * r * 8.0 * px;
    vec3 s = texture(u_input, v_uv + o).rgb;
    float k = exp(-r * r * 2.0);
    acc += max(s - p_threshold, 0.0) * k; w += k;
  }
  return vec4(base + acc / w * p_intensity * 3.0, 1.0);
}`
  },
  {
    id: 'grade', name: 'Colour Grade', category: 'effect', tags: ['colour'],
    description: 'Brightness, contrast, saturation, hue and tint.',
    params: [
      f('brightness', 'Brightness', 0, 3, 1),
      f('contrast', 'Contrast', 0, 3, 1),
      f('saturation', 'Saturation', 0, 3, 1),
      f('hue', 'Hue shift', -1, 1, 0),
      f('gamma', 'Gamma', 0.3, 3, 1),
      col('tint', 'Tint colour', 'p0'),
      f('tintAmount', 'Tint amount', 0, 1, 0)
    ],
    glsl: `
vec4 layer(){
  vec3 c = texture(u_input, v_uv).rgb;
  c = hueShift(c, p_hue);
  c = (c - 0.5) * p_contrast + 0.5;
  c *= p_brightness;
  c = saturate3(c, p_saturation);
  c = pow(max(c, 0.0), vec3(1.0 / p_gamma));
  c = mix(c, c * p_tint * 1.5, p_tintAmount);
  return vec4(c, 1.0);
}`
  },
  {
    id: 'palettemap', name: 'Palette Map', category: 'effect', tags: ['colour'],
    description: 'Recolours everything below using the current palette. Instantly makes any image match your colours.',
    params: [
      f('amount', 'Amount', 0, 1, 1),
      f('offset', 'Offset', 0, 1, 0),
      f('cycle', 'Cycle speed', -1, 1, 0),
      f('contrast', 'Contrast', 0.3, 3, 1),
      bool('loop', 'Loop colours', false)
    ],
    glsl: `
vec4 layer(){
  vec3 c = texture(u_input, v_uv).rgb;
  float l = clamp((luma(c) - 0.5) * p_contrast + 0.5, 0.0, 1.0);
  float t = l + p_offset + u_t * p_cycle * 0.1;
  vec3 m = p_loop > 0.5 ? pal(t) : palLinear(fract(t));
  if (p_loop < 0.5 && p_cycle == 0.0 && p_offset == 0.0) m = palLinear(l);
  return vec4(mix(c, m, p_amount), 1.0);
}`
  },
  {
    id: 'flash', name: 'Strobe / Flash', category: 'effect', tags: ['strobe', 'rave'],
    description: 'Flashes the screen. Link it to the kick or snare for instant energy.',
    params: [
      f('amount', 'Amount', 0, 1, 0),
      sel('mode', 'Type', ['Colour flash', 'Invert', 'Blackout', 'Brighten']),
      col('colour', 'Flash colour', '#ffffff')
    ],
    defaultMods: { amount: mod('kick', 0.6, 0.12) },
    glsl: `
vec4 layer(){
  vec3 c = texture(u_input, v_uv).rgb;
  int m = int(p_mode + 0.5);
  float a = clamp(p_amount, 0.0, 1.0);
  if (m == 0) c = mix(c, p_colour, a);
  else if (m == 1) c = mix(c, 1.0 - c, a);
  else if (m == 2) c = mix(c, vec3(0.0), a);
  else c = c * (1.0 + a * 2.0);
  return vec4(c, 1.0);
}`
  },
  {
    id: 'pixelate', name: 'Pixelate', category: 'effect', tags: ['retro', 'glitch'],
    description: 'Chunky pixels.',
    params: [f('size', 'Pixel size', 1, 120, 12), f('amount', 'Amount', 0, 1, 1)],
    glsl: `
vec4 layer(){
  vec2 cells = u_res / max(1.0, p_size * u_res.y / 1080.0);
  vec2 uv = (floor(v_uv * cells) + 0.5) / cells;
  return vec4(mix(texture(u_input, v_uv).rgb, texture(u_input, uv).rgb, p_amount), 1.0);
}`
  },
  {
    id: 'shake', name: 'Shake / Zoom Punch', category: 'effect', tags: ['rave', 'energy'],
    description: 'Camera shake and punchy zooms. Usually linked to the kick.',
    params: [
      f('zoom', 'Zoom punch', 0, 1, 0),
      f('shake', 'Shake', 0, 1, 0),
      f('tilt', 'Tilt', 0, 1, 0)
    ],
    defaultMods: { zoom: mod('kick', 0.35, 0.18) },
    glsl: `
vec4 layer(){
  vec2 p = centered(v_uv);
  float tt = floor(u_t * 30.0);
  p /= 1.0 + p_zoom * 0.4;
  p += (hash22(vec2(tt, 1.0)) - 0.5) * p_shake * 0.08;
  p = rot((hash11(tt * 3.1) - 0.5) * p_tilt * 0.3) * p;
  vec2 uv = uncenter(p);
  uv = abs(mod(uv - 1.0, 2.0) - 1.0);
  return vec4(texture(u_input, uv).rgb, 1.0);
}`
  },
  {
    id: 'warp', name: 'Wave Warp', category: 'effect', tags: ['liquid', 'psychedelic'],
    description: 'Bends everything below with waves, liquid wobble or a swirl.',
    params: [
      sel('mode', 'Type', ['Waves', 'Liquid', 'Swirl', 'Ripple']),
      f('amount', 'Amount', 0, 1, 0.3),
      f('freq', 'Frequency', 0.5, 30, 6),
      f('speed', 'Speed', 0, 4, 1)
    ],
    glsl: `
vec4 layer(){
  vec2 uv = v_uv; vec2 p = centered(uv);
  int m = int(p_mode + 0.5);
  float t = u_t * p_speed;
  if (m == 0) uv += vec2(sin(uv.y * p_freq + t * 2.0), cos(uv.x * p_freq + t * 1.7)) * p_amount * 0.04;
  else if (m == 1) uv += (vec2(fbm(p * p_freq * 0.4 + t * 0.3), fbm(p * p_freq * 0.4 + 5.0 - t * 0.3)) - 0.5) * p_amount * 0.2;
  else if (m == 2){ float r = length(p); p = rot(p_amount * 4.0 * exp(-r * 3.0) * sin(t * 0.5 + 1.0)) * p; uv = uncenter(p); }
  else { float r = length(p); p += normalize(p + 0.0001) * sin(r * p_freq * 4.0 - t * 4.0) * p_amount * 0.03; uv = uncenter(p); }
  uv = abs(mod(uv - 1.0, 2.0) - 1.0);
  return vec4(texture(u_input, uv).rgb, 1.0);
}`
  },
  {
    id: 'edges', name: 'Neon Edges', category: 'effect', tags: ['neon', 'lines'],
    description: 'Traces the outlines of everything below in glowing colour.',
    params: [
      f('strength', 'Strength', 0, 4, 1.5),
      f('keep', 'Keep original', 0, 1, 0),
      sel('colourMode', 'Colour', ['Palette', 'Original colours', 'Single colour']),
      col('colour', 'Single colour', 'p0')
    ],
    glsl: `
vec4 layer(){
  vec2 px = 1.5 / u_res;
  float tl = luma(texture(u_input, v_uv + vec2(-px.x, px.y)).rgb), t = luma(texture(u_input, v_uv + vec2(0.0, px.y)).rgb), tr = luma(texture(u_input, v_uv + px).rgb);
  float l = luma(texture(u_input, v_uv + vec2(-px.x, 0.0)).rgb), r = luma(texture(u_input, v_uv + vec2(px.x, 0.0)).rgb);
  float bl = luma(texture(u_input, v_uv - px).rgb), b = luma(texture(u_input, v_uv - vec2(0.0, px.y)).rgb), br = luma(texture(u_input, v_uv + vec2(px.x, -px.y)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
  float e = clamp(length(vec2(gx, gy)) * p_strength, 0.0, 1.0);
  vec3 orig = texture(u_input, v_uv).rgb;
  int cm = int(p_colourMode + 0.5);
  vec3 c = cm == 0 ? pal(v_uv.x * 0.5 + v_uv.y * 0.5 + u_t * 0.05) : (cm == 1 ? orig * 1.5 : p_colour);
  return vec4(orig * p_keep + c * e, 1.0);
}`
  },
  {
    id: 'posterise', name: 'Posterise', category: 'effect', tags: ['retro', 'colour'],
    description: 'Reduces colours to a few flat bands.',
    params: [f('levels', 'Levels', 2, 16, 4, { step: 1 }), f('amount', 'Amount', 0, 1, 1)],
    glsl: `
vec4 layer(){
  vec3 c = texture(u_input, v_uv).rgb;
  vec3 q = floor(c * p_levels) / (p_levels - 1.0);
  return vec4(mix(c, q, p_amount), 1.0);
}`
  },
  {
    id: 'film', name: 'Film Look', category: 'effect', tags: ['lofi', 'retro', 'soft'],
    description: 'Vignette, grain and soft light leaks.',
    params: [
      f('vignette', 'Vignette', 0, 1, 0.4),
      f('grain', 'Grain', 0, 1, 0.3),
      f('leak', 'Light leak', 0, 1, 0.2),
      col('leakColour', 'Leak colour', 'p0'),
      f('fade', 'Faded blacks', 0, 0.5, 0.05)
    ],
    glsl: `
vec4 layer(){
  vec3 c = texture(u_input, v_uv).rgb;
  vec2 p = centered(v_uv);
  c *= 1.0 - p_vignette * smoothstep(0.3, 1.0, length(p) * 1.2);
  c += (hash21(v_uv * u_res + fract(u_t * 13.0) * 50.0) - 0.5) * p_grain * 0.25;
  float lk = fbm(vec2(v_uv.x * 2.0 + u_t * 0.1, u_t * 0.05)) * smoothstep(0.2, 1.0, v_uv.x + v_uv.y * 0.3);
  c += p_leakColour * lk * p_leak;
  c = c * (1.0 - p_fade) + p_fade;
  return vec4(c, 1.0);
}`
  },
  {
    id: 'tile', name: 'Tile Repeat', category: 'effect', tags: ['geometric'],
    description: 'Repeats the image below in a grid.',
    params: [f('tiles', 'Tiles', 1, 12, 3, { step: 1 }), bool('mirror', 'Mirror tiles', true), f('scroll', 'Scroll speed', -2, 2, 0)],
    glsl: `
vec4 layer(){
  vec2 uv = v_uv * floor(p_tiles) + vec2(u_t * p_scroll * 0.2, 0.0);
  vec2 uvm = p_mirror > 0.5 ? abs(mod(uv - 1.0, 2.0) - 1.0) : fract(uv);
  return vec4(texture(u_input, uvm).rgb, 1.0);
}`
  },
  {
    id: 'zoomblur', name: 'Zoom Blur', category: 'effect', tags: ['energy'],
    description: 'Radial motion blur that rushes from the centre.',
    params: [f('amount', 'Amount', 0, 1, 0.2)],
    defaultMods: { amount: mod('kick', 0.3, 0.2) },
    glsl: `
vec4 layer(){
  vec3 acc = vec3(0.0);
  vec2 d = v_uv - 0.5;
  for (int i = 0; i < 16; i++){ float k = float(i) / 15.0; acc += texture(u_input, 0.5 + d * (1.0 - k * p_amount * 0.3)).rgb; }
  return vec4(acc / 16.0, 1.0);
}`
  },
  {
    id: 'led', name: 'LED Screen', category: 'effect', tags: ['led', 'geometric', 'minimal'],
    description: 'Turns everything into a grid of glowing LED cells.',
    params: [f('cells', 'Cells across', 10, 200, 80, { step: 1 }), f('gap', 'Gap', 0, 0.8, 0.25), bool('round', 'Round LEDs', true), f('boost', 'Boost', 0.5, 3, 1.4)],
    glsl: `
vec4 layer(){
  vec2 n = vec2(p_cells, p_cells / aspect());
  vec2 g = v_uv * n; vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
  vec3 c = texture(u_input, (id + 0.5) / n).rgb;
  float d = p_round > 0.5 ? length(fr) : max(abs(fr.x), abs(fr.y));
  float m = smoothstep(0.5 - p_gap * 0.5, 0.5 - p_gap * 0.5 - 0.08, d);
  return vec4(c * m * p_boost, 1.0);
}`
  },
  {
    id: 'invert', name: 'Invert', category: 'effect', tags: ['strobe'],
    description: 'Inverts colours.',
    params: [f('amount', 'Amount', 0, 1, 1)],
    glsl: `
vec4 layer(){ vec3 c = texture(u_input, v_uv).rgb; return vec4(mix(c, 1.0 - c, p_amount), 1.0); }`
  }
];
