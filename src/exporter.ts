import type { Project } from './types';
import { Renderer } from './engine/renderer';
import { platform } from './platform';

export interface ExportSettings { outPath: string; encoder: 'auto' | 'nvenc' | 'cpu'; quality: 'high' | 'max' | 'small'; start: number; end: number; }

export interface ExportProgress { frame: number; total: number; fps: number; eta: number; encoder: string; }

export class ExportJob {
  cancelled = false;
  cancel() { this.cancelled = true; }

  private async makeRenderer(project: Project, w: number, h: number) {
    const r = new Renderer(document.createElement('canvas'));
    r.resize(w, h);
    r.resetState();
    await r.preloadMedia(project);
    return r;
  }

  async run(project: Project, s: ExportSettings, onProgress: (p: ExportProgress) => void): Promise<{ ok: boolean; message: string }> {
    const api = platform.api;
    if (!api) return { ok: false, message: 'Exporting only works in the desktop app.' };
    const { width: w, height: h, fps } = project.settings;
    let r = await this.makeRenderer(project, w, h);
    const duration = Math.max(0.1, s.end - s.start);
    const total = Math.ceil(duration * fps);
    const audioInputs = project.audio.filter((a) => !a.muted).map((a) => ({ path: a.path, volume: a.volume }));
    const job = await api.exportStart({ outPath: s.outPath, width: w, height: h, fps, duration, audio: audioInputs, audioStart: s.start, encoder: s.encoder, quality: s.quality });
    const bufs = [new Uint8Array(w * h * 4), new Uint8Array(w * h * 4)];
    let pending: Promise<boolean> | null = null;
    let recoveries = 0;
    const t0 = performance.now();
    // warm up feedback effects with a short pre-roll so trails look right from the first frame
    const preroll = (renderer: Renderer, upTo: number) => {
      for (let i = Math.max(0, Math.floor(upTo * fps) - 30); i < Math.floor(upTo * fps); i++) renderer.renderFrame(project, i / fps, w, h);
    };
    try {
      preroll(r, s.start);
      for (let i = 0; i < total; i++) {
        if (this.cancelled) { await api.exportCancel(job.id); return { ok: false, message: 'Export cancelled' }; }
        const t = s.start + i / fps;
        const buf = bufs[i % 2];
        await r.syncVideos(project, t, true, false);
        r.renderFrame(project, t, w, h);
        r.readPixels(buf);
        if (r.gl.isContextLost()) {
          // the graphics driver reset; rebuild and try this frame again
          if (++recoveries > 3) throw new Error('The graphics card stopped responding while rendering. Try a lower resolution, fewer heavy effects (Glow, Fractal, Trails), or close other programs using the graphics card.');
          r = await this.makeRenderer(project, w, h);
          preroll(r, t);
          i--;
          continue;
        }
        if (pending) await pending;
        pending = api.exportFrame(job.id, buf);
        if (i % 5 === 0 || i === total - 1) {
          const el = (performance.now() - t0) / 1000;
          const rate = (i + 1) / el;
          onProgress({ frame: i + 1, total, fps: rate, eta: (total - i - 1) / rate, encoder: job.encoder });
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      if (pending) await pending;
      const res = await api.exportFinish(job.id);
      if (!res.ok) return { ok: false, message: 'The video encoder reported a problem:\n' + res.log };
      return { ok: true, message: 'Export finished' };
    } catch (e) {
      await api.exportCancel(job.id);
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      r.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}
