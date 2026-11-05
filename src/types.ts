// Project data model. Everything here is saved into the .skimo project file.

export type ParamValue = number | string | boolean;

export interface Modulation {
  source: string;   // e.g. 'kick', 'bass', 'beat', 'stem:<id>:level'
  amount: number;   // -1..1, fraction of the parameter range
  decay: number;    // seconds, used by hit sources
}

export interface Keyframe { t: number; v: number; }

export interface Clip {
  id: string;
  trackId: string;
  type: string;            // layer definition id
  name: string;
  start: number;           // seconds
  end: number;             // seconds
  params: Record<string, ParamValue>;
  mods: Record<string, Modulation>;
  keys: Record<string, Keyframe[]>;   // recorded or hand set automation (absolute times)
  blend: BlendMode;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
  mediaIds?: string[];     // images / videos used by media layers
  text?: string;
  font?: string;
  paletteId?: string | null; // null = follow project colour track
  mediaOffset?: number;    // in point for video
}

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'overlay' | 'difference' | 'lighten' | 'darken';

export interface Track {
  id: string;
  name: string;
  hidden: boolean;
  locked: boolean;
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'video';
  path: string;
  name: string;
  width: number;
  height: number;
  duration?: number;
}

export interface AudioRef {
  id: string;
  path: string;
  name: string;
  role: StemRole;
  volume: number;
  muted: boolean;
}

export type StemRole = 'master' | 'drums' | 'kick' | 'snare' | 'hats' | 'bass' | 'melody' | 'vocals' | 'fx' | 'other';

export interface Hit { t: number; s: number; }   // time, strength 0..1

export interface Marker { id: string; t: number; name: string; colour: string; }

export interface Palette { id: string; name: string; colours: string[]; custom?: boolean; }

export interface PaletteKey { id: string; t: number; paletteId: string; fade: number; } // fade in beats

export interface PaletteCycle {
  enabled: boolean;
  paletteIds: string[];
  every: 'beat' | 'bar' | '2bars' | '4bars' | '8bars' | '16bars' | 'kick' | 'snare';
  fade: number; // beats
}

export interface PadEvent { id: string; pad: string; start: number; end: number; }

export interface ProjectSettings {
  aspect: string;      // '16:9'
  resolution: string;  // '1080p'
  width: number;
  height: number;
  fps: number;
  background: string;
}

export interface DetectionSettings { sensitivity: number; }

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  audioMode: 'master' | 'stems';
  audio: AudioRef[];        // master mode: one entry with role 'master'
  bpm: number;
  beatOffset: number;       // seconds to first downbeat
  beatsPerBar: number;
  duration: number;
  hits: Record<string, Hit[]>;
  hitsEdited: Record<string, boolean>;
  detection: Record<string, DetectionSettings>;
  markers: Marker[];
  palettes: Palette[];      // custom palettes (presets are built in)
  basePaletteId: string;
  paletteKeys: PaletteKey[];
  paletteCycle: PaletteCycle;
  media: MediaItem[];
  tracks: Track[];          // index 0 is the bottom layer
  clips: Clip[];
  pads: PadEvent[];
  generateSeed: number;
}
