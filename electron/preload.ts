import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  openFiles: (opts: { title?: string; filters?: { name: string; extensions: string[] }[]; multi?: boolean; kind?: string }) =>
    ipcRenderer.invoke('dialog:open', opts) as Promise<string[]>,
  saveFile: (opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[]; kind?: string; fallbackDir?: string }) =>
    ipcRenderer.invoke('dialog:save', opts) as Promise<string | null>,
  readBinary: (p: string) => ipcRenderer.invoke('fs:readBinary', p) as Promise<ArrayBuffer>,
  readText: (p: string) => ipcRenderer.invoke('fs:readText', p) as Promise<string | null>,
  writeText: (p: string, text: string) => ipcRenderer.invoke('fs:writeText', p, text) as Promise<boolean>,
  exists: (p: string) => ipcRenderer.invoke('fs:exists', p) as Promise<boolean>,
  writeBinary: (p: string, data: Uint8Array) => ipcRenderer.invoke('fs:writeBinary', p, data) as Promise<boolean>,
  stat: (p: string) => ipcRenderer.invoke('fs:stat', p) as Promise<{ size: number; mtime: number } | null>,
  modelPath: () => ipcRenderer.invoke('app:modelPath') as Promise<string>,
  paths: () => ipcRenderer.invoke('app:paths') as Promise<{ userData: string; videos: string; documents: string }>,
  showItem: (p: string) => ipcRenderer.invoke('app:showItem', p),
  quit: () => ipcRenderer.invoke('app:quit'),
  takeOpenPath: () => ipcRenderer.invoke('app:takeOpenPath') as Promise<string | null>,
  onCloseRequest: (cb: () => void) => { ipcRenderer.on('app:close-request', () => cb()); },
  onOpenProject: (cb: (p: string) => void) => { ipcRenderer.on('app:open-project', (_e, p) => cb(p)); },
  exportStart: (opts: unknown) => ipcRenderer.invoke('export:start', opts) as Promise<{ id: string; encoder: string }>,
  exportFrame: (id: string, data: Uint8Array) => ipcRenderer.invoke('export:frame', id, data) as Promise<boolean>,
  exportFinish: (id: string) => ipcRenderer.invoke('export:finish', id) as Promise<{ ok: boolean; log: string; size: number }>,
  exportCancel: (id: string) => ipcRenderer.invoke('export:cancel', id),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  exportProbe: () => ipcRenderer.invoke('export:probe') as Promise<{ nvenc: boolean }>
};

contextBridge.exposeInMainWorld('skimo', api);
export type SkimoApi = typeof api;
