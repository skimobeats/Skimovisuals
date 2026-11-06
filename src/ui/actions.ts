import { useStore, makeClip, findFreeTrack, snapTime, addTrack } from '../store';
import { playback } from '../playback';
import type { Clip, MediaItem, Project } from '../types';
import { platform, baseName } from '../platform';
import { uid } from '../store';
import { laneDefs, detectLane } from '../audio/audio';

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
export const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];
export const AUDIO_EXT = ['wav', 'mp3', 'flac', 'aif', 'aiff', 'ogg', 'm4a'];

export function defaultLength(p: Project) {
  return (60 / p.bpm) * p.beatsPerBar * 8;
}

/** Add a new layer to the timeline at time t (defaults to the playhead) */
export function addLayer(type: string, extra: Partial<Clip> = {}, at?: number, trackId?: string, length?: number) {
  const st = useStore.getState();
  const p = st.project!;
  let start = at ?? playback.time;
  if (st.snap) start = Math.max(0, snapTime(p, start));
  const end = Math.min(p.duration, start + (length ?? defaultLength(p)));
  if (end - start < 0.1) start = Math.max(0, end - defaultLength(p));
  let id = '';
  st.update((proj) => {
    let tid = trackId ?? findFreeTrack(proj, start, end);
    if (!trackId && type === 'logo') {
      // the logo always goes on top so everything shows through it
      const top = proj.tracks[proj.tracks.length - 1];
      const busy = proj.clips.some((c) => c.trackId === top.id && c.start < end && c.end > start);
      tid = busy ? addTrack(proj, 'Logo').id : top.id;
    }
    const c = makeClip(type, tid, start, Math.max(start + 0.5, end), extra);
    proj.clips.push(c);
    id = c.id;
  });
  st.select({ kind: 'clip', ids: [id] });
  return id;
}

function probeMedia(path: string, kind: 'image' | 'video'): Promise<{ width: number; height: number; duration?: number }> {
  return new Promise((resolve) => {
    const url = platform.mediaUrl(path);
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = url;
    } else {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => resolve({ width: 0, height: 0 });
      v.src = url;
    }
  });
}

export async function importMediaPaths(paths: string[]) {
  const items: MediaItem[] = [];
  const failed: string[] = [];
  for (const path of paths) {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const kind = IMAGE_EXT.includes(ext) ? 'image' : VIDEO_EXT.includes(ext) ? 'video' : null;
    if (!kind) continue;
    const info = await probeMedia(path, kind);
    if (!info.width) { failed.push(baseName(path)); continue; }
    items.push({ id: uid(), kind, path, name: baseName(path), ...info });
  }
  if (items.length) useStore.getState().update((p) => { p.media.push(...items); });
  if (failed.length) alert(`These files could not be opened:\n${failed.join('\n')}\n\nFor video, MP4 (H.264) or WebM work best.`);
  return items;
}

export async function importMedia() {
  const paths = await platform.openFiles({ title: 'Add images or videos', multi: true, filters: [{ name: 'Images and video', extensions: [...IMAGE_EXT, ...VIDEO_EXT] }] });
  return importMediaPaths(paths);
}

/** Re-run detection for lanes the user has not hand edited */
export function redetectLanes(force = false, only?: string) {
  useStore.getState().update((p) => {
    for (const lane of laneDefs(p)) {
      if (only && lane.id !== only) continue;
      if (force || !p.hitsEdited[lane.id]) { p.hits[lane.id] = detectLane(p, lane); if (force) p.hitsEdited[lane.id] = false; }
    }
  }, true);
}

export const CATEGORY_COLOUR: Record<string, string> = { generator: 'var(--gen)', media: 'var(--media)', text: 'var(--text-c)', effect: 'var(--fx)', logo: '#1fb5c8', hero: '#e8873a' };
