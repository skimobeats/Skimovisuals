import { create } from 'zustand';
import type { Clip, Project, Track } from './types';
import { getDef } from './engine/registry';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const ASPECTS: { id: string; label: string; w: number; h: number }[] = [
  { id: '16:9', label: '16:9 YouTube', w: 16, h: 9 },
  { id: '9:16', label: '9:16 TikTok, Reels, Shorts', w: 9, h: 16 },
  { id: '1:1', label: '1:1 Square', w: 1, h: 1 },
  { id: '4:5', label: '4:5 Instagram post', w: 4, h: 5 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '21:9', label: '21:9 Cinema', w: 21, h: 9 },
  { id: '2:1', label: '2:1', w: 2, h: 1 }
];
export const RESOLUTIONS: { id: string; short: number }[] = [
  { id: '720p', short: 720 }, { id: '1080p', short: 1080 }, { id: '2K', short: 1440 }, { id: '4K', short: 2160 }
];
export const FRAME_RATES = [24, 25, 30, 50, 60];

export function computeSize(aspect: string, resolution: string) {
  const a = ASPECTS.find((x) => x.id === aspect) || ASPECTS[0];
  const r = RESOLUTIONS.find((x) => x.id === resolution) || RESOLUTIONS[1];
  const even = (n: number) => Math.round(n / 2) * 2;
  if (a.w >= a.h) return { width: even((r.short * a.w) / a.h), height: r.short };
  return { width: r.short, height: even((r.short * a.h) / a.w) };
}

export function newProject(opts: { name: string; aspect: string; resolution: string; fps: number }): Project {
  const size = computeSize(opts.aspect, opts.resolution);
  return {
    version: 1,
    name: opts.name,
    settings: { aspect: opts.aspect, resolution: opts.resolution, fps: opts.fps, ...size, background: '#0b0b0d' },
    audioMode: 'master',
    audio: [],
    bpm: 120,
    beatOffset: 0,
    beatsPerBar: 4,
    duration: 60,
    hits: {},
    hitsEdited: {},
    detection: {},
    markers: [],
    palettes: [],
    basePaletteId: 'skimo-ember',
    paletteKeys: [],
    paletteCycle: { enabled: false, paletteIds: [], every: '4bars', fade: 1 },
    colourReact: { hueSource: '', hueAmount: 0.08, swapOn: '', brightSource: '', brightAmount: 0.3 },
    media: [],
    tracks: [
      { id: uid(), name: 'Track 1', hidden: false, locked: false },
      { id: uid(), name: 'Track 2', hidden: false, locked: false },
      { id: uid(), name: 'Track 3', hidden: false, locked: false }
    ],
    clips: [],
    pads: [],
    generateSeed: 1
  };
}

/** Fill in anything added since the project was saved */
export function migrateProject(p: Project): Project {
  p.colourReact ||= { hueSource: '', hueAmount: 0.08, swapOn: '', brightSource: '', brightAmount: 0.3 };
  p.paletteCycle ||= { enabled: false, paletteIds: [], every: '4bars', fade: 1 };
  p.pads ||= []; p.markers ||= []; p.paletteKeys ||= []; p.palettes ||= []; p.hitsEdited ||= {}; p.detection ||= {};
  return p;
}

export function makeClip(type: string, trackId: string, start: number, end: number, extra: Partial<Clip> = {}): Clip {
  const def = getDef(type);
  const params: Clip['params'] = {};
  for (const p of def.params) params[p.key] = p.def;
  return {
    id: uid(), trackId, type, name: def.name, start, end, params,
    // generated visuals and effects react harder by default so nothing feels static
    mods: Object.fromEntries(Object.entries(structuredClone(def.defaultMods || {})).map(([k, m]) => [k, (def.category === 'generator' || def.category === 'effect') ? { ...m, amount: Math.max(-1, Math.min(1, m.amount * 1.4)) } : m])), keys: {},
    blend: def.category === 'effect' ? 'normal' : def.category === 'generator' ? 'screen' : 'normal',
    opacity: 1, fadeIn: 0, fadeOut: 0, paletteId: null,
    ...extra
  };
}

export type Selection = { kind: 'clip'; ids: string[] } | { kind: 'transition'; id: string } | { kind: 'marker'; id: string } | { kind: 'pad'; id: string } | { kind: 'paletteKey'; id: string } | null;

export type Panel = 'skimo' | 'media' | 'generators' | 'effects' | 'transitions' | 'text' | 'colour' | 'audio' | 'presets';

interface State {
  project: Project | null;
  filePath: string | null;
  dirty: boolean;
  past: string[];
  future: string[];
  selection: Selection;
  time: number;
  playing: boolean;
  zoom: number;          // pixels per second
  panel: Panel;
  snap: boolean;
  previewScale: number;  // fraction of project resolution used for preview
  recording: boolean;    // perform mode recording
  performOpen: boolean;
  placing: string | null; // clip id of a 3D hero being placed into its scene
  analysisVersion: number;
  busy: { msg: string; progress: number } | null;
  toast: string | null;

  setProject(p: Project | null, filePath?: string | null): void;
  /** Change the project. history=false for live drags (call checkpoint() first). */
  update(fn: (p: Project) => void, history?: boolean): void;
  checkpoint(): void;
  undo(): void;
  redo(): void;
  set(partial: Partial<State>): void;
  select(sel: Selection): void;
  showToast(msg: string): void;
}

const MAX_HISTORY = 100;

export const useStore = create<State>((set, get) => ({
  project: null,
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  selection: null,
  time: 0,
  playing: false,
  zoom: 40,
  panel: 'media',
  snap: true,
  previewScale: 0.5,
  recording: false,
  performOpen: false,
  placing: null,
  analysisVersion: 0,
  busy: null,
  toast: null,

  setProject(p, filePath = null) {
    set({ project: p, filePath, dirty: false, past: [], future: [], selection: null, time: 0 });
  },
  update(fn, history = true) {
    const cur = get().project;
    if (!cur) return;
    const next: Project = structuredClone(cur);
    fn(next);
    if (history) {
      const past = [...get().past, JSON.stringify(cur)].slice(-MAX_HISTORY);
      set({ project: next, past, future: [], dirty: true });
    } else {
      set({ project: next, dirty: true });
    }
  },
  checkpoint() {
    const cur = get().project;
    if (!cur) return;
    set({ past: [...get().past, JSON.stringify(cur)].slice(-MAX_HISTORY), future: [] });
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = JSON.parse(past[past.length - 1]);
    set({ project: prev, past: past.slice(0, -1), future: [JSON.stringify(project), ...future].slice(0, MAX_HISTORY), dirty: true });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = JSON.parse(future[0]);
    set({ project: next, future: future.slice(1), past: [...past, JSON.stringify(project)], dirty: true });
  },
  set(partial) { set(partial as State); },
  select(sel) { set({ selection: sel }); },
  showToast(msg) {
    set({ toast: msg });
    setTimeout(() => { if (get().toast === msg) set({ toast: null }); }, 3000);
  }
}));

export function selectedClips(): Clip[] {
  const { project, selection } = useStore.getState();
  if (!project || selection?.kind !== 'clip') return [];
  return project.clips.filter((c) => selection.ids.includes(c.id));
}

export function addTrack(p: Project, name?: string): Track {
  const t: Track = { id: uid(), name: name || `Track ${p.tracks.length + 1}`, hidden: false, locked: false };
  p.tracks.push(t);
  return t;
}

/** Find a track with free space between start and end, or add a new one at the top */
export function findFreeTrack(p: Project, start: number, end: number, preferTop = true): string {
  const order = preferTop ? [...p.tracks].reverse() : p.tracks;
  for (const tr of order) {
    const busy = p.clips.some((c) => c.trackId === tr.id && c.start < end && c.end > start);
    if (!busy) return tr.id;
  }
  return addTrack(p).id;
}

export function snapTime(p: Project, t: number, div = 1): number {
  const beat = 60 / p.bpm / div;
  return Math.round((t - p.beatOffset) / beat) * beat + p.beatOffset;
}
