import type { Palette } from './types';

// Built in colour swatches. Pastels first, but plenty of other moods too.
export const PRESET_PALETTES: Palette[] = [
  // Skimo palettes, taken from release artwork
  { id: 'skimo-ember', name: 'Skimo Ember', colours: ['#1fb5c8', '#f08a2c', '#f5c36b', '#111114'] },
  { id: 'skimo-memory', name: 'Skimo Memory', colours: ['#d9ccb5', '#b04a32', '#7d8b90', '#1a1918'] },
  { id: 'skimo-night', name: 'Skimo Night', colours: ['#22d3c5', '#ff3d7f', '#f6e7c1', '#0c0c11'] },
  { id: 'skimo-rust', name: 'Skimo Rust', colours: ['#ff6a2a', '#ffd08a', '#2fa7b4', '#140f0d'] },
  { id: 'skimo-deepsea', name: 'Skimo Deep Sea', colours: ['#19b3c6', '#f2a65a', '#0c5f8a', '#071018'] },
  { id: 'skimo-ash', name: 'Skimo Ash', colours: ['#ece6da', '#ff5a36', '#8f8a85', '#141414'] },
  { id: 'skimo-amber', name: 'Skimo Amber', colours: ['#ffb238', '#1fb5c8', '#e8553d', '#120d0a'] },
  { id: 'skimo-orchid', name: 'Skimo Orchid', colours: ['#c46bff', '#1fb5c8', '#ffcf8a', '#0e0a14'] },
  { id: 'pastel-dream', name: 'Pastel Dream', colours: ['#ffb5c2', '#b5d8ff', '#c9b5ff', '#fff1b5'] },
  { id: 'cotton-candy', name: 'Cotton Candy', colours: ['#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff'] },
  { id: 'mint-lilac', name: 'Mint Lilac', colours: ['#b8f2e6', '#d6c7ff', '#f6c6ea', '#faf3dd'] },
  { id: 'peach-sky', name: 'Peach Sky', colours: ['#ffd6a5', '#fdffb6', '#9bf6ff', '#ffadad'] },
  { id: 'lofi-sunset', name: 'Lofi Sunset', colours: ['#f4a6b8', '#f9c784', '#8e7dbe', '#3d3a6b'] },
  { id: 'sorbet', name: 'Sorbet', colours: ['#ff9aa2', '#ffdac1', '#e2f0cb', '#b5ead7'] },
  { id: 'lavender-haze', name: 'Lavender Haze', colours: ['#e0c3fc', '#8ec5fc', '#f9f871', '#ffffff'] },
  { id: 'seafoam', name: 'Seafoam', colours: ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5'] },
  { id: 'neon-rave', name: 'Neon Rave', colours: ['#ff00a0', '#00f0ff', '#b000ff', '#f5ff00'] },
  { id: 'acid', name: 'Acid', colours: ['#c6ff00', '#00ff85', '#ff00c8', '#111111'] },
  { id: 'vaporwave', name: 'Vaporwave', colours: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff'] },
  { id: 'cyber-blue', name: 'Cyber Blue', colours: ['#00d4ff', '#0057ff', '#e6f9ff', '#001433'] },
  { id: 'inferno', name: 'Inferno', colours: ['#ff3c00', '#ffb000', '#ff0055', '#2a0010'] },
  { id: 'ice', name: 'Ice', colours: ['#e0fbfc', '#98c1d9', '#3d5a80', '#ffffff'] },
  { id: 'mono-white', name: 'Mono White', colours: ['#ffffff', '#bbbbbb', '#666666', '#000000'] },
  { id: 'mono-red', name: 'Mono Red', colours: ['#ff2a2a', '#ffffff', '#7a0000', '#000000'] },
  { id: 'forest-dusk', name: 'Forest Dusk', colours: ['#95d5b2', '#52b788', '#d8f3dc', '#1b4332'] },
  { id: 'golden-hour', name: 'Golden Hour', colours: ['#ffcf56', '#ff8c42', '#f3e8ee', '#5e2b7e'] },
  { id: 'deep-space', name: 'Deep Space', colours: ['#7b2ff7', '#f107a3', '#3df5ff', '#0b0b2b'] },
  { id: 'retro-vhs', name: 'Retro VHS', colours: ['#ff6b6b', '#feca57', '#48dbfb', '#5f27cd'] },
  { id: 'toxic', name: 'Toxic', colours: ['#39ff14', '#00ffd5', '#ffffff', '#0a0f0a'] },
  { id: 'rose-gold', name: 'Rose Gold', colours: ['#f7cac9', '#dea5a4', '#f6e2b3', '#92a8d1'] }
];

export const SKIMO_IDS = ['skimo-ember', 'skimo-memory', 'skimo-night', 'skimo-rust', 'skimo-deepsea', 'skimo-ash', 'skimo-amber', 'skimo-orchid'];

export const PASTEL_IDS = ['pastel-dream', 'cotton-candy', 'mint-lilac', 'peach-sky', 'lofi-sunset', 'sorbet', 'lavender-haze', 'seafoam', 'rose-gold'];

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  const c = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Rotate a colour round the colour wheel by a fraction of a turn */
export function hueRotate(c: [number, number, number], turn: number): [number, number, number] {
  const a = turn * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a), k = 0.57735;
  const dot = (c[0] + c[1] + c[2]) * k;
  const cross: [number, number, number] = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  return [0, 1, 2].map((i) => c[i] * cos + cross[i] * sin + k * dot * (1 - cos)) as [number, number, number];
}

/** Pick four representative colours from an image: the most common strong colours, darkest last */
export function paletteFromPixels(data: Uint8ClampedArray): string[] {
  const pts: number[][] = [];
  for (let i = 0; i < data.length; i += 16) if (data[i + 3] > 128) pts.push([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);
  if (pts.length < 8) return ['#ffffff', '#888888', '#444444', '#000000'];
  // k-means with 6 clusters, seeded across brightness
  pts.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let cents = [0.05, 0.25, 0.45, 0.65, 0.8, 0.95].map((f) => [...pts[Math.floor(f * (pts.length - 1))]]);
  const counts = new Array(cents.length).fill(0);
  for (let it = 0; it < 12; it++) {
    const sums = cents.map(() => [0, 0, 0]); counts.fill(0);
    for (const p of pts) {
      let bi = 0, bd = 9;
      cents.forEach((c, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = i; } });
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    cents = cents.map((c, i) => (counts[i] ? sums[i].map((v) => v / counts[i]) : c));
  }
  const sat = (c: number[]) => Math.max(...c) - Math.min(...c);
  const lum = (c: number[]) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const order = cents.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0);
  const darkest = order.reduce((a, b) => (lum(a.c) < lum(b.c) ? a : b));
  const rest = order.filter((x) => x !== darkest).sort((a, b) => b.n * (0.3 + sat(b.c) * 2) - a.n * (0.3 + sat(a.c) * 2));
  const picked = [...rest.slice(0, 3).map((x) => x.c), darkest.c];
  while (picked.length < 4) picked.unshift([1, 1, 1]);
  return picked.map((c) => rgbToHex(c[0], c[1], c[2]));
}

export function allPalettes(custom: Palette[]): Palette[] {
  return [...PRESET_PALETTES, ...custom];
}

export function findPalette(id: string | null | undefined, custom: Palette[]): Palette {
  return allPalettes(custom).find((p) => p.id === id) || PRESET_PALETTES[0];
}
