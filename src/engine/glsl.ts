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

export const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fragColor;
uniform sampler2D u_src; uniform float u_flip;
void main(){ vec2 uv = v_uv; if (u_flip > 0.5) uv.y = 1.0 - uv.y; vec4 c = texture(u_src, uv); fragColor = vec4(c.rgb, 1.0); }`;

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
