// Perform mode: live pads and recording slider moves as automation.
import { useStore, uid } from './store';
import { playback } from './playback';

const held = new Map<string, number>();
const lastWrite = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export const perform = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  activePads(): string[] { return [...held.keys()]; },
  isHeld(id: string) { return held.has(id); },
  padDown(id: string) {
    if (held.has(id)) return;
    held.set(id, playback.time);
    emit();
  },
  padUp(id: string) {
    const start = held.get(id);
    held.delete(id);
    emit();
    const st = useStore.getState();
    if (start === undefined || !st.recording || !st.playing) return;
    const end = Math.max(playback.time, start + 0.05);
    st.update((p) => { p.pads.push({ id: uid(), pad: id, start, end }); });
  },
  /** While recording, slider moves become keyframes at the current time. Returns true if recorded. */
  recordParam(clipId: string, key: string, value: number): boolean {
    const st = useStore.getState();
    if (!st.recording || !st.playing) return false;
    const t = playback.time;
    const k = clipId + ':' + key;
    const prev = lastWrite.get(k);
    st.update((p) => {
      const c = p.clips.find((x) => x.id === clipId);
      if (!c) return;
      const keys = c.keys[key] || [];
      // overwrite anything between the previous write and now
      const from = prev !== undefined && prev <= t && t - prev < 1 ? prev : t - 0.001;
      const kept = keys.filter((x) => x.t <= from || x.t > t);
      if (!keys.length) {
        // start the automation from the value the slider had before recording began
        const before = Number(c.params[key] ?? value);
        kept.push({ t: Math.max(c.start, t - 0.05), v: before });
      }
      kept.push({ t, v: value });
      kept.sort((a, b) => a.t - b.t);
      c.keys[key] = kept;
    }, prev === undefined);
    lastWrite.set(k, t);
    return true;
  },
  endTake() { lastWrite.clear(); }
};
