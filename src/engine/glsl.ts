// Shared GLSL used by every layer shader.

export const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export const HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_t;
uniform float u_beat;
uniform float u_seed;
uniform vec3 u_pal[4];
uniform sampler2D u_input;
uniform sampler2D u_prev;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_tex0Res;
uniform vec2 u_tex1Res;
uniform float u_morph;
uniform float u_morphSeed;
uniform float u_spec[32];
uniform float u_spin;
uniform float u_step;
#define PI 3.14159265
#define TAU 6.2831853

float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float aspect(){ return u_res.x / u_res.y; }
vec2 centered(vec2 uv){ return (uv - 0.5) * vec2(aspect(), 1.0); }
vec2 uncenter(vec2 p){ return p / vec2(aspect(), 1.0) + 0.5; }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 pal(float t){ t = fract(t) * 4.0; float i = floor(t); float f = fract(t); f = f * f * (3.0 - 2.0 * f);
  vec3 a = u_pal[0]; vec3 b = u_pal[1];
  if (i < 0.5){ a = u_pal[0]; b = u_pal[1]; } else if (i < 1.5){ a = u_pal[1]; b = u_pal[2]; } else if (i < 2.5){ a = u_pal[2]; b = u_pal[3]; } else { a = u_pal[3]; b = u_pal[0]; }
  return mix(a, b, f); }
vec3 palLinear(float t){ t = clamp(t, 0.0, 1.0) * 3.0; float i = floor(t); float f = t - i;
  if (i < 0.5) return mix(u_pal[3], u_pal[0], f); if (i < 1.5) return mix(u_pal[0], u_pal[1], f); if (i < 2.5) return mix(u_pal[1], u_pal[2], f); return u_pal[2]; }
vec3 hueShift(vec3 c, float h){ const vec3 k = vec3(0.57735); float ca = cos(h * TAU); return c * ca + cross(k, c) * sin(h * TAU) + k * dot(k, c) * (1.0 - ca); }
vec3 saturate3(vec3 c, float s){ return mix(vec3(luma(c)), c, s); }
float spec(float x){ x = clamp(x, 0.0, 1.0) * 31.0; int i = int(floor(x)); float f = fract(x); int j = min(i + 1, 31); return mix(u_spec[i], u_spec[j], f); }
float sdPoly(vec2 p, float n){ float a = atan(p.x, p.y) + PI; float r = TAU / n; return cos(floor(0.5 + a / r) * r - a) * length(p); }
`;

// Final output. Bright areas roll off smoothly like film instead of clipping to flat white.
export const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fragColor;
uniform sampler2D u_src; uniform float u_flip;
vec3 rolloff(vec3 c){
  c = max(c, 0.0);
  float k = 0.72;
  float m = max(c.r, max(c.g, c.b));
  if (m <= k) return c;
  float mm = k + (1.0 - k) * (1.0 - exp(-(m - k) / (1.0 - k)));
  vec3 scaled = c * (mm / m);
  // let very bright colours drift gently towards white rather than turning flat
  float w = clamp((m - 1.0) * 0.25, 0.0, 0.35);
  return mix(scaled, vec3(mm), w);
}
void main(){ vec2 uv = v_uv; if (u_flip > 0.5) uv.y = 1.0 - uv.y; vec4 c = texture(u_src, uv); fragColor = vec4(rolloff(c.rgb), 1.0); }`;

// Transition between two layers on the same track
export const TRANSITION_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fragColor;
uniform sampler2D u_from; uniform sampler2D u_to;
uniform float u_p; uniform int u_type; uniform vec2 u_res; uniform float u_seed; uniform vec3 u_col;
#define PI 3.14159265
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y); }
vec4 A(vec2 uv){ return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(u_from, uv); }
vec4 B(vec2 uv){ return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(u_to, uv); }
vec2 zoomUv(vec2 uv, float z){ return (uv - 0.5) / z + 0.5; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void main(){
  vec2 uv = v_uv;
  float p = clamp(u_p, 0.0, 1.0);
  float e = p * p * (3.0 - 2.0 * p);
  float asp = u_res.x / u_res.y;
  vec4 c;
  if (u_type == 0) c = mix(A(uv), B(uv), e);
  else if (u_type == 1 || u_type == 2) {
    vec4 mid = u_type == 1 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(u_col, 1.0);
    c = p < 0.5 ? mix(A(uv), mid, smoothstep(0.0, 0.5, p)) : mix(mid, B(uv), smoothstep(0.5, 1.0, p));
  }
  else if (u_type == 3) c = uv.x < 1.0 - e ? A(uv + vec2(e, 0.0)) : B(uv - vec2(1.0 - e, 0.0));
  else if (u_type == 4) c = uv.y > e ? A(uv - vec2(0.0, e)) : B(uv + vec2(0.0, 1.0 - e));
  else if (u_type == 5) {
    vec4 a = A(zoomUv(uv, 1.0 + e * 4.0)); vec4 b = B(zoomUv(uv, 0.2 + e * 0.8));
    c = mix(a, b, smoothstep(0.35, 0.65, p));
  }
  else if (u_type == 6) {
    // Skimo wipe: a slanted band in the logo's angle sweeps across
    vec2 q = vec2((uv.x - 0.5) * asp, uv.y - 0.5);
    float slant = q.x + q.y * 0.42;
    float edge = mix(-0.75 * asp - 0.5, 0.75 * asp + 0.5, e);
    float band = 0.12;
    c = slant < edge - band ? B(uv) : A(uv);
    float inBand = step(edge - band, slant) * step(slant, edge);
    c = mix(c, vec4(u_col, 1.0), inBand);
  }
  else if (u_type == 7) {
    float tt = floor(p * 14.0);
    vec2 bid = floor(uv * vec2(14.0, 28.0));
    float h = hash21(bid + tt + u_seed);
    vec2 off = (vec2(hash21(bid * 1.7 + tt), hash21(bid * 2.3 - tt)) - 0.5) * 0.12 * sin(p * PI);
    vec4 a = A(uv + off); vec4 b = B(uv - off);
    c = h < e ? b : a;
    float split = 0.015 * sin(p * PI);
    vec4 cr = h < e ? B(uv + off + vec2(split, 0.0)) : A(uv + off + vec2(split, 0.0));
    c.r = mix(c.r, cr.r, sin(p * PI));
  }
  else if (u_type == 8) {
    float cells = mix(600.0, 14.0, sin(p * PI));
    vec2 g = vec2(cells, cells / asp);
    vec2 q = (floor(uv * g) + 0.5) / g;
    c = p < 0.5 ? A(q) : B(q);
  }
  else if (u_type == 9) {
    vec2 q = vec2((uv.x - 0.5) * asp, uv.y - 0.5);
    vec2 qa = rot(e * PI * 0.8) * q * (1.0 + e * 2.0);
    vec2 qb = rot((e - 1.0) * PI * 0.8) * q * (1.0 + (1.0 - e) * 2.0);
    vec4 a = A(vec2(qa.x / asp, qa.y) + 0.5); vec4 b = B(vec2(qb.x / asp, qb.y) + 0.5);
    c = mix(a, b, smoothstep(0.4, 0.6, p));
  }
  else if (u_type == 10) {
    vec2 g = vec2(10.0, 10.0 / asp);
    vec2 cid = floor(uv * g);
    float delay = hash21(cid + u_seed) * 0.6;
    float k = clamp((p - delay) / 0.4, 0.0, 1.0);
    vec2 fall = vec2((hash21(cid * 3.1) - 0.5) * 0.3, -1.2) * k * k;
    vec2 lu = uv - fall;
    vec2 inside = floor(lu * g);
    c = (inside == cid && k < 1.0) ? A(lu) : vec4(0.0);
    c = mix(B(uv), c, c.a);
  }
  else {
    vec2 d = (vec2(noise(uv * 4.0 + u_seed), noise(uv * 4.0 + 9.0 + u_seed)) - 0.5) * 0.35;
    float th = smoothstep(e - 0.25, e + 0.25, noise(uv * 3.0 + u_seed * 2.0));
    c = mix(B(uv - d * (1.0 - e)), A(uv + d * e), th);
  }
  fragColor = c;
}`;

// Blend a layer (u_src) over the accumulated image (u_dst)
export const BLEND_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fragColor;
uniform sampler2D u_src; uniform sampler2D u_dst; uniform float u_opacity; uniform int u_mode;
vec3 overlay(vec3 a, vec3 b){ return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a)); }
void main(){
  vec4 s = texture(u_src, v_uv); vec4 d = texture(u_dst, v_uv);
  vec3 c = s.rgb;
  if (u_mode == 1) c = d.rgb + s.rgb;
  else if (u_mode == 2) c = 1.0 - (1.0 - d.rgb) * (1.0 - s.rgb);
  else if (u_mode == 3) c = d.rgb * s.rgb;
  else if (u_mode == 4) c = overlay(d.rgb, s.rgb);
  else if (u_mode == 5) c = abs(d.rgb - s.rgb);
  else if (u_mode == 6) c = max(d.rgb, s.rgb);
  else if (u_mode == 7) c = min(d.rgb, s.rgb);
  float a = clamp(s.a * u_opacity, 0.0, 1.0);
  fragColor = vec4(mix(d.rgb, c, a), 1.0);
}`;

export const BLEND_MODES = ['normal', 'add', 'screen', 'multiply', 'overlay', 'difference', 'lighten', 'darken'] as const;
