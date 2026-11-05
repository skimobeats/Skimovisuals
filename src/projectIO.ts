import type { Clip, Palette, Project, Track, PaletteKey } from './types';
import { platform, joinPath } from './platform';
import { useStore, uid } from './store';
import { clearAudio, loadProjectAudio, audioDuration, laneDefs, detectLane } from './audio/audio';

export const PROJECT_FILTERS = [{ name: 'Skimovisuals project', extensions: ['skimo'] }];

export async function saveProject(saveAs = false): Promise<boolean> {
  const { project, filePath } = useStore.getState();
  if (!project) return false;
  let path = filePath;
  if (!path || saveAs) {
    path = await platform.saveFile({ title: 'Save project', defaultPath: `${project.name || 'Untitled'}.skimo`, filters: PROJECT_FILTERS });
    if (!path) return false;
  }
  await platform.writeText(path, JSON.stringify(project, null, 1));
  useStore.setState({ filePath: path, dirty: false });
  useStore.getState().showToast('Project saved');
  return true;
}

export async function openProjectFile(path?: string) {
  if (!path) {
    const paths = await platform.openFiles({ title: 'Open project', filters: PROJECT_FILTERS });
    if (!paths.length) return;
    path = paths[0];
  }
  const text = await platform.readText(path);
  if (!text) { useStore.getState().showToast('Could not open that file'); return; }
  const project = JSON.parse(text) as Project;
  // warn about any files that have moved
  const missing: string[] = [];
  for (const a of project.audio) if (!(await platform.exists(a.path))) missing.push(a.name);
  for (const m of project.media) if (!(await platform.exists(m.path))) missing.push(m.name);
  clearAudio();
  useStore.getState().setProject(project, path);
  if (missing.length) alert(`These files could not be found and may have been moved:\n\n${missing.join('\n')}`);
  await analyseProject();
}

/** Decode and analyse all audio, then fill any hit lanes the user has not edited */
export async function analyseProject() {
  const st = useStore.getState();
  const project = st.project;
  if (!project || !project.audio.length) return;
  st.set({ busy: { msg: 'Loading audio', progress: 0 } });
  try {
    await loadProjectAudio(project, (msg, progress) => useStore.setState({ busy: { msg, progress } }));
  } catch (e) {
    console.error(e);
    alert('Sorry, that audio file could not be read. WAV, MP3, FLAC or AIFF files work best.');
    useStore.setState({ busy: null });
    return;
  }
  useStore.getState().update((p) => {
    p.duration = Math.max(1, audioDuration(p));
    for (const lane of laneDefs(p)) {
      if (!p.hitsEdited[lane.id] || !p.hits[lane.id]) p.hits[lane.id] = detectLane(p, lane);
    }
  }, false);
  useStore.setState((s) => ({ busy: null, analysisVersion: s.analysisVersion + 1 }));
}

// ---------- Autosave ----------
let autosaveTimer: number | undefined;
export function startAutosave() {
  clearInterval(autosaveTimer);
  autosaveTimer = window.setInterval(async () => {
    const { project, dirty } = useStore.getState();
    if (!project || !dirty) return;
    const { userData } = await platform.paths();
    await platform.writeText(joinPath(userData, 'autosave.skimo'), JSON.stringify(project));
  }, 60000);
}

export async function autosavePath() {
  const { userData } = await platform.paths();
  return joinPath(userData, 'autosave.skimo');
}

// ---------- Presets (shared between projects) ----------
export interface LayerPreset { id: string; name: string; clip: Omit<Clip, 'id' | 'trackId' | 'start' | 'end'>; }
export interface LookPreset { id: string; name: string; bpm: number; beatsPerBar: number; tracks: Track[]; clips: Clip[]; basePaletteId: string; paletteKeys: PaletteKey[]; paletteCycle: Project['paletteCycle']; palettes: Palette[]; }
export interface PresetFile { layers: LayerPreset[]; looks: LookPreset[]; palettes: Palette[]; }

let presetCache: PresetFile | null = null;

async function presetPath() { const { userData } = await platform.paths(); return joinPath(userData, 'presets.json'); }

export async function loadPresets(): Promise<PresetFile> {
  if (presetCache) return presetCache;
  const text = await platform.readText(await presetPath());
  try { presetCache = text ? JSON.parse(text) : null; } catch { presetCache = null; }
  if (!presetCache) presetCache = { layers: [], looks: [], palettes: [] };
  presetCache.palettes ||= []; presetCache.layers ||= []; presetCache.looks ||= [];
  return presetCache;
}

export async function savePresets(p: PresetFile) {
  presetCache = p;
  await platform.writeText(await presetPath(), JSON.stringify(p, null, 1));
}

export function clipToPreset(c: Clip, name: string): LayerPreset {
  const { id: _i, trackId: _t, start: _s, end: _e, ...rest } = structuredClone(c);
  return { id: uid(), name, clip: rest };
}

export function lookFromProject(p: Project, name: string): LookPreset {
  return {
    id: uid(), name, bpm: p.bpm, beatsPerBar: p.beatsPerBar,
    tracks: structuredClone(p.tracks), clips: structuredClone(p.clips).map((c) => ({ ...c, mediaIds: c.mediaIds })),
    basePaletteId: p.basePaletteId, paletteKeys: structuredClone(p.paletteKeys), paletteCycle: structuredClone(p.paletteCycle), palettes: structuredClone(p.palettes)
  };
}

/** Apply a saved look to this project, stretching it from bars in the old song to bars in this one */
export function applyLook(p: Project, look: LookPreset) {
  const oldBar = (60 / look.bpm) * look.beatsPerBar;
  const newBar = (60 / p.bpm) * p.beatsPerBar;
  const k = newBar / oldBar;
  const map = (t: number) => Math.min(p.duration, t * k);
  p.tracks = structuredClone(look.tracks);
  const mediaIds = new Set(p.media.map((m) => m.id));
  p.clips = structuredClone(look.clips).map((c) => {
    const keys: Clip['keys'] = {};
    for (const [key, ks] of Object.entries(c.keys)) keys[key] = ks.map((x) => ({ t: map(x.t), v: x.v }));
    const ids = c.mediaIds ? c.mediaIds.filter((id) => mediaIds.has(id)) : undefined;
    return { ...c, id: uid(), start: map(c.start), end: c.end >= look.clips.reduce((m, x) => Math.max(m, x.end), 0) - 0.01 ? p.duration : map(c.end), keys, mediaIds: c.type === 'media' ? (ids && ids.length ? ids : p.media.map((m) => m.id)) : c.mediaIds };
  }).filter((c) => c.end - c.start > 0.05);
  p.basePaletteId = look.basePaletteId;
  p.paletteKeys = look.paletteKeys.map((x) => ({ ...x, t: map(x.t) }));
  p.paletteCycle = structuredClone(look.paletteCycle);
  for (const pal of look.palettes) if (!p.palettes.some((x) => x.id === pal.id)) p.palettes.push(pal);
}
