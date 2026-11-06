// Transitions that sit on the join between two clips on the same track
export interface TransitionDef { id: string; name: string; description: string; index: number; }

export const TRANSITIONS: TransitionDef[] = [
  { id: 'fade', name: 'Crossfade', description: 'A smooth blend from one clip into the next.', index: 0 },
  { id: 'dipblack', name: 'Dip to black', description: 'Fades out to black, then into the next clip.', index: 1 },
  { id: 'flash', name: 'Flash', description: 'A bright flash in your palette colour.', index: 2 },
  { id: 'slideleft', name: 'Slide', description: 'The next clip pushes the old one off to the side.', index: 3 },
  { id: 'slideup', name: 'Slide up', description: 'The next clip pushes up from below.', index: 4 },
  { id: 'zoom', name: 'Zoom through', description: 'Rush forward through the old clip into the new one.', index: 5 },
  { id: 'skimo', name: 'Skimo wipe', description: 'A slanted band at the angle of the Skimo logo sweeps across.', index: 6 },
  { id: 'glitch', name: 'Glitch cut', description: 'Blocks tear and switch over in a digital glitch.', index: 7 },
  { id: 'pixel', name: 'Pixelate', description: 'Breaks into big pixels and resolves into the next clip.', index: 8 },
  { id: 'spin', name: 'Spin', description: 'Twists out and spins the next clip in.', index: 9 },
  { id: 'shatter', name: 'Shatter', description: 'The old clip breaks into tiles that fall away.', index: 10 },
  { id: 'liquid', name: 'Liquid', description: 'A wobbly, melting blend between the two.', index: 11 }
];

export const TRANSITION_MAP = new Map(TRANSITIONS.map((t) => [t.id, t]));
