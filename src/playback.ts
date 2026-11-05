// Fast moving playhead state kept outside React so 60fps updates do not re-render the UI.
import { useStore } from './store';
import * as audio from './audio/audio';

type Listener = (t: number) => void;
const listeners = new Set<Listener>();
let time = 0;

export const playback = {
  get time() { return time; },
  subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  setTime(t: number) {
    const p = useStore.getState().project;
    const dur = p?.duration ?? 0;
    time = Math.max(0, Math.min(dur, t));
    audio.setPausedTime(time);
    for (const l of listeners) l(time);
  },
  seek(t: number) {
    const st = useStore.getState();
    const wasPlaying = st.playing;
    if (wasPlaying) audio.stop();
    this.setTime(t);
    useStore.setState({ time });
    if (wasPlaying && st.project) audio.play(st.project, time);
  },
  play() {
    const st = useStore.getState();
    if (!st.project || !st.project.audio.length) { st.showToast('Add a track first in the Audio tab'); return; }
    if (time >= st.project.duration - 0.05) this.setTime(0);
    audio.play(st.project, time);
    useStore.setState({ playing: true });
  },
  pause() {
    audio.stop();
    this.setTime(audio.currentTime());
    useStore.setState({ playing: false, time });
  },
  toggle() { if (useStore.getState().playing) this.pause(); else this.play(); },
  /** Called every animation frame while playing */
  tick() {
    const st = useStore.getState();
    if (!st.playing || !st.project) return;
    const t = audio.currentTime();
    if (t >= st.project.duration) { this.pause(); this.setTime(st.project.duration); return; }
    time = t;
    for (const l of listeners) l(time);
  },
  /** Restart audio so mute and volume changes are heard straight away */
  refreshAudio() {
    const st = useStore.getState();
    if (st.playing && st.project) { audio.stop(); audio.play(st.project, time); }
  }
};
