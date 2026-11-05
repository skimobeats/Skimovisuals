// Bridge to the Electron main process, with a browser fallback used for development and testing.
import type { SkimoApi } from '../electron/preload';

declare global {
  interface Window { skimo?: SkimoApi; }
}

export const isElectron = typeof window !== 'undefined' && !!window.skimo;

type Filter = { name: string; extensions: string[] };

// Browser fallback: files picked via <input> are tracked by a pseudo path
const browserFiles = new Map<string, File>();
const browserUrls = new Map<string, string>();
const browserStore = new Map<string, string>();

function pickBrowserFiles(filters?: Filter[], multi?: boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!multi;
    if (filters) input.accept = filters.flatMap((f) => f.extensions.map((e) => (e === '*' ? '*' : '.' + e))).join(',');
    input.onchange = () => {
      const out: string[] = [];
      for (const f of Array.from(input.files || [])) {
        const p = `browser://${Math.random().toString(36).slice(2)}/${f.name}`;
        browserFiles.set(p, f);
        out.push(p);
      }
      resolve(out);
    };
    input.click();
  });
}

/** Register an in-memory file (used by tests) */
export function registerBrowserFile(name: string, blob: Blob): string {
  const p = `browser://${Math.random().toString(36).slice(2)}/${name}`;
  browserFiles.set(p, new File([blob], name));
  return p;
}

export const platform = {
  async openFiles(opts: { title?: string; filters?: Filter[]; multi?: boolean }): Promise<string[]> {
    if (window.skimo) return window.skimo.openFiles(opts);
    return pickBrowserFiles(opts.filters, opts.multi);
  },
  async saveFile(opts: { title?: string; defaultPath?: string; filters?: Filter[] }): Promise<string | null> {
    if (window.skimo) return window.skimo.saveFile(opts);
    return 'browser-store://' + (opts.defaultPath || 'project.skimo');
  },
  async readBinary(p: string): Promise<ArrayBuffer> {
    if (window.skimo) return window.skimo.readBinary(p);
    const f = browserFiles.get(p);
    if (f) return f.arrayBuffer();
    const r = await fetch(p);
    return r.arrayBuffer();
  },
  async readText(p: string): Promise<string | null> {
    if (window.skimo) return window.skimo.readText(p);
    if (browserStore.has(p)) return browserStore.get(p)!;
    const f = browserFiles.get(p);
    if (f) return f.text();
    try { return localStorage.getItem('skimo:' + p); } catch { return null; }
  },
  async writeText(p: string, text: string): Promise<boolean> {
    if (window.skimo) return window.skimo.writeText(p, text);
    browserStore.set(p, text);
    try { localStorage.setItem('skimo:' + p, text); } catch { /* ignore */ }
    return true;
  },
  async exists(p: string): Promise<boolean> {
    if (window.skimo) return window.skimo.exists(p);
    return browserFiles.has(p) || browserStore.has(p);
  },
  async paths() {
    if (window.skimo) return window.skimo.paths();
    return { userData: 'browser-store://userdata', videos: 'browser-store://videos', documents: 'browser-store://documents' };
  },
  mediaUrl(p: string): string {
    if (window.skimo) return 'media://local/?p=' + encodeURIComponent(p);
    const f = browserFiles.get(p);
    if (f) {
      let u = browserUrls.get(p);
      if (!u) { u = URL.createObjectURL(f); browserUrls.set(p, u); }
      return u;
    }
    return p;
  },
  showItem(p: string) { window.skimo?.showItem(p); },
  quit() { if (window.skimo) window.skimo.quit(); },
  takeOpenPath() { return window.skimo ? window.skimo.takeOpenPath() : Promise.resolve(null); },
  onCloseRequest(cb: () => void) { window.skimo?.onCloseRequest(cb); },
  onOpenProject(cb: (p: string) => void) { window.skimo?.onOpenProject(cb); },
  /** Path for a file dropped from Explorer */
  pathForFile(file: File): string {
    if (window.skimo) return window.skimo.pathForFile(file);
    const p = `browser://${Math.random().toString(36).slice(2)}/${file.name}`;
    browserFiles.set(p, file);
    return p;
  },
  get api() { return window.skimo; }
};

export function joinPath(dir: string, name: string) {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + name;
}

export function baseName(p: string) {
  return p.split(/[\\/]/).pop() || p;
}

export function dirName(p: string) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(0, i) : '';
}
