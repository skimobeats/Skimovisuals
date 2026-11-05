import type { Palette } from './types';

// Built in colour swatches. Pastels first, but plenty of other moods too.
export const PRESET_PALETTES: Palette[] = [
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

export function allPalettes(custom: Palette[]): Palette[] {
  return [...PRESET_PALETTES, ...custom];
}

export function findPalette(id: string | null | undefined, custom: Palette[]): Palette {
  return allPalettes(custom).find((p) => p.id === id) || PRESET_PALETTES[0];
}
