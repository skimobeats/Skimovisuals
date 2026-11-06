import { GENERATORS } from './layers/generators';
import { EFFECTS } from './layers/effects';
import { MEDIA_LAYERS } from './layers/media';
import { LOGO_LAYER } from './layers/logo';
import { HERO_LAYER } from './hero';
import type { LayerDef } from './layers/types';

export const ALL_LAYERS: LayerDef[] = [LOGO_LAYER, HERO_LAYER, ...MEDIA_LAYERS, ...GENERATORS, ...EFFECTS];
export const LAYERS = new Map(ALL_LAYERS.map((d) => [d.id, d]));

export function getDef(id: string): LayerDef {
  return LAYERS.get(id) || GENERATORS[0];
}

// Performance pads: momentary effects triggered from the keyboard in Perform mode
export interface PadDef { id: string; key: string; label: string; type: string; params: Record<string, number | string | boolean>; strobe?: boolean; }

export const PADS: PadDef[] = [
  { id: 'strobe', key: 'q', label: 'Strobe', type: 'flash', params: { amount: 1, mode: 0, colour: '#ffffff' }, strobe: true },
  { id: 'invert', key: 'w', label: 'Invert', type: 'invert', params: { amount: 1 } },
  { id: 'blackout', key: 'e', label: 'Blackout', type: 'flash', params: { amount: 1, mode: 2 } },
  { id: 'glitch', key: 'r', label: 'Glitch burst', type: 'glitch', params: { amount: 0.9, blocks: 12, slices: 0.8, colour: 0.6, rate: 20 } },
  { id: 'rgb', key: 't', label: 'RGB split', type: 'rgbsplit', params: { amount: 0.6, angle: 0, radial: true } },
  { id: 'kaleido', key: 'y', label: 'Kaleidoscope', type: 'kaleido', params: { segments: 8, spin: 0.4, rotate: 0, zoom: 1, offsetX: 0, offsetY: 0 } },
  { id: 'mirror', key: 'u', label: 'Mirror x4', type: 'mirror', params: { mode: 4 } },
  { id: 'punch', key: 'i', label: 'Zoom punch', type: 'shake', params: { zoom: 0.8, shake: 0.4, tilt: 0.3 } },
  { id: 'pixel', key: 'o', label: 'Pixelate', type: 'pixelate', params: { size: 30, amount: 1 } },
  { id: 'trails', key: 'p', label: 'Trails', type: 'feedback', params: { decay: 0.9, zoom: 0.03, rotate: 0.01, shiftX: 0, shiftY: 0, hue: 0.02, mode: 0 } },
  { id: 'edges', key: 'a', label: 'Neon edges', type: 'edges', params: { strength: 2, keep: 0, colourMode: 0, colour: 'p0' } },
  { id: 'warp', key: 's', label: 'Liquid warp', type: 'warp', params: { mode: 1, amount: 0.6, freq: 6, speed: 1.5 } },
  { id: 'poster', key: 'd', label: 'Posterise', type: 'posterise', params: { levels: 3, amount: 1 } },
  { id: 'led', key: 'f', label: 'LED screen', type: 'led', params: { cells: 60, gap: 0.3, round: true, boost: 1.5 } },
  { id: 'hue', key: 'g', label: 'Hue spin', type: 'grade', params: { brightness: 1.1, contrast: 1.1, saturation: 1.3, hue: 0.5, gamma: 1, tint: 'p0', tintAmount: 0 } },
  { id: 'zoomblur', key: 'h', label: 'Zoom blur', type: 'zoomblur', params: { amount: 0.8 } }
];
export const PAD_MAP = new Map(PADS.map((p) => [p.id, p]));
