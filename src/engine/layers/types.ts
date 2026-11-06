import type { Modulation, ParamValue } from '../../types';

export interface ParamDef {
  key: string;
  label: string;
  type: 'float' | 'select' | 'bool' | 'colour';
  min?: number;
  max?: number;
  step?: number;
  def: ParamValue;
  options?: string[];
  group?: string;
}

export type LayerCategory = 'generator' | 'media' | 'text' | 'effect' | 'logo';

export interface LayerDef {
  id: string;
  name: string;
  category: LayerCategory;
  description: string;
  params: ParamDef[];
  glsl: string;              // must define: vec4 layer()
  feedback?: boolean;        // needs its own previous frame in u_prev
  defaultMods?: Record<string, Modulation>;
  tags?: string[];           // used by the generator to pick styles
}

export const f = (key: string, label: string, min: number, max: number, def: number, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ key, label, type: 'float', min, max, def, step: extra.step ?? (max - min) / 200, ...extra });
export const sel = (key: string, label: string, options: string[], def = 0, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ key, label, type: 'select', options, def, ...extra });
export const col = (key: string, label: string, def = 'p0', extra: Partial<ParamDef> = {}): ParamDef =>
  ({ key, label, type: 'colour', def, ...extra });
export const bool = (key: string, label: string, def = false, extra: Partial<ParamDef> = {}): ParamDef =>
  ({ key, label, type: 'bool', def, ...extra });

export const mod = (source: string, amount: number, decay = 0.25): Modulation => ({ source, amount, decay });

export const SPEED = f('speed', 'Speed', 0, 4, 1, { group: 'Motion' });
