// Small preview images for the layer library, rendered with the real engine.
import { Renderer } from '../engine/renderer';
import { newProject, makeClip } from '../store';
import { ALL_LAYERS } from '../engine/registry';
import { HERO_SHAPES, BUST_SHAPE } from '../engine/hero';

const cache = new Map<string, string>();
let cachedPalette = '';
const listeners = new Set<() => void>();
export function onThumbnails(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function layerThumbnails(paletteId: string): Map<string, string> {
  if (cachedPalette === paletteId && cache.size) return cache;
  cache.clear();
  cachedPalette = paletteId;
  try {
    const canvas = document.createElement('canvas');
    const r = new Renderer(canvas);
    const p = newProject({ name: 'thumbs', aspect: '16:9', resolution: '720p', fps: 30 });
    p.basePaletteId = paletteId;
    p.duration = 100;
    const track = p.tracks[0].id;
    const under = makeClip('shapes', track, 0, 100);
    // the 3D hero shapes, one picture per shape
    const heroThumb = (shape: number) => {
      const c = makeClip('hero', p.tracks[1].id, 0, 100);
      c.params.shape = shape;
      c.mods = {};
      p.clips = [c];
      r.resetState();
      r.renderFrame(p, 3, 192, 108);
      r.present();
      cache.set('hero:' + shape, canvas.toDataURL('image/jpeg', 0.8));
    };
    for (let shape = 0; shape < HERO_SHAPES.length; shape++) if (shape !== BUST_SHAPE) heroThumb(shape);
    // the scanned bust loads a moment later
    r.heroReady.then(() => { heroThumb(BUST_SHAPE); for (const l of listeners) l(); r.gl.getExtension('WEBGL_lose_context')?.loseContext(); });
    for (const def of ALL_LAYERS) {
      if (def.category === 'media' || def.category === 'hero') continue;
      const c = makeClip(def.id, p.tracks[1].id, 0, 100, def.category === 'text' ? { text: 'Aa' } : {});
      c.mods = {};
      if (def.id === 'flash') c.params.amount = 0.5;
      if (def.id === 'shake') c.params.zoom = 0.5;
      p.clips = def.category === 'effect' || def.category === 'text' ? [under, c] : [c];
      if (def.category === 'text') c.blend = 'normal';
      r.resetState();
      for (let i = 0; i < (def.feedback ? 20 : 1); i++) r.renderFrame(p, 3 + i / 30, 192, 108);
      r.present();
      cache.set(def.id, canvas.toDataURL('image/jpeg', 0.8));
    }
  } catch (e) {
    console.warn('Thumbnails failed', e);
  }
  return cache;
}
