import { app, BrowserWindow, dialog, ipcMain, protocol, Menu, shell } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Custom protocol so the renderer can stream local media (images, video, audio)
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
]);

let win: BrowserWindow | null = null;
let allowClose = false;
let pendingOpenPath: string | null = null;

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const p: string = require('ffmpeg-static');
  return p.replace('app.asar', 'app.asar.unpacked');
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.aif': 'audio/aiff', '.aiff': 'audio/aiff', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
};

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.searchParams.get('p') || '');
    try {
      const stat = await fs.promises.stat(filePath);
      const size = stat.size;
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const range = request.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m && m[1] ? parseInt(m[1], 10) : 0;
        let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (!m || !m[1]) { // suffix range
          if (m && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
        }
        end = Math.min(end, size - 1);
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(stream as any, {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes'
          }
        });
      }
      const stream = fs.createReadStream(filePath);
      return new Response(stream as any, {
        status: 200,
        headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
      });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#121216',
    title: 'Skimovisuals',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      win?.webContents.toggleDevTools();
    }
  });
  win.on('close', (e) => {
    if (!allowClose) {
      e.preventDefault();
      win?.webContents.send('app:close-request');
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// ---------- Export (ffmpeg pipe) ----------
interface ExportJob { proc: ChildProcess; stderr: string; done: Promise<number>; outPath: string; }
const jobs = new Map<string, ExportJob>();

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (err) => resolve({ code: -1, stderr: String(err) }));
    p.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

let nvencCache: boolean | null = null;
async function probeNvenc(): Promise<boolean> {
  if (nvencCache !== null) return nvencCache;
  const r = await runFfmpeg(['-hide_banner', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-']);
  nvencCache = r.code === 0;
  return nvencCache;
}

interface ExportOptions {
  outPath: string; width: number; height: number; fps: number; duration: number;
  audio: { path: string; volume: number }[];
  audioStart?: number;
  encoder: 'auto' | 'nvenc' | 'cpu';
  videoKbps: number;
  audioKbps: number;
}

ipcMain.handle('export:start', async (_e, opts: ExportOptions) => {
  const id = Math.random().toString(36).slice(2);
  let useNvenc = false;
  if (opts.encoder === 'nvenc' || opts.encoder === 'auto') useNvenc = await probeNvenc();
  const args: string[] = ['-y', '-hide_banner',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${opts.width}x${opts.height}`, '-r', String(opts.fps), '-i', 'pipe:0'];
  for (const a of opts.audio) {
    if (opts.audioStart && opts.audioStart > 0) args.push('-ss', opts.audioStart.toFixed(3));
    args.push('-i', a.path);
  }
  // bitrate targets come from the app so the file size matches the estimate shown
  const v = Math.max(300, Math.round(opts.videoKbps));
  if (opts.audio.length > 0) {
    const parts = opts.audio.map((a, i) => `[${i + 1}:a]volume=${a.volume.toFixed(3)}[a${i}]`);
    const mix = opts.audio.length > 1
      ? `${opts.audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${opts.audio.length}:normalize=0[aout]`
      : `[a0]anull[aout]`;
    args.push('-filter_complex', [...parts, mix].join(';'), '-map', '0:v', '-map', '[aout]');
  } else {
    args.push('-map', '0:v');
  }
  if (useNvenc) {
    args.push('-c:v', 'h264_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`, '-spatial-aq', '1');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`);
  }
  args.push('-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(opts.fps));
  if (opts.audio.length > 0) args.push('-c:a', 'aac', '-b:a', `${opts.audioKbps || 320}k`);
  args.push('-t', opts.duration.toFixed(3), '-movflags', '+faststart', opts.outPath);

  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  const job: ExportJob = { proc, stderr: '', done: Promise.resolve(0), outPath: opts.outPath };
  proc.stderr?.on('data', (d) => { job.stderr = (job.stderr + d.toString()).slice(-8000); });
  proc.stdin?.on('error', () => { /* handled via close */ });
  job.done = new Promise((resolve) => {
    proc.on('error', () => resolve(-1));
    proc.on('close', (code) => resolve(code ?? -1));
  });
  jobs.set(id, job);
  return { id, encoder: useNvenc ? 'NVIDIA (NVENC)' : 'CPU (x264)' };
});

ipcMain.handle('export:frame', async (_e, id: string, data: Uint8Array) => {
  const job = jobs.get(id);
  if (!job || !job.proc.stdin || job.proc.exitCode !== null) throw new Error('Export not running: ' + (job?.stderr.slice(-600) ?? ''));
  const stdin = job.proc.stdin;
  await new Promise<void>((resolve, reject) => {
    const ok = stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength), (err) => { if (err) reject(err); });
    if (ok) resolve();
    else stdin.once('drain', () => resolve());
  });
  return true;
});

ipcMain.handle('export:finish', async (_e, id: string) => {
  const job = jobs.get(id);
  if (!job) return { ok: false, log: 'No job' };
  job.proc.stdin?.end();
  const code = await job.done;
  jobs.delete(id);
  let size = 0;
  try { size = (await fs.promises.stat(job.outPath)).size; } catch { /* missing */ }
  return { ok: code === 0, log: job.stderr.slice(-2000), size };
});

ipcMain.handle('export:cancel', async (_e, id: string) => {
  const job = jobs.get(id);
  if (!job) return;
  try { job.proc.stdin?.destroy(); } catch { /* ignore */ }
  job.proc.kill('SIGKILL');
  jobs.delete(id);
});

ipcMain.handle('export:probe', async () => ({ nvenc: await probeNvenc() }));

// ---------- Files and dialogs ----------
// Remember the last folder used for each kind of file (projects, exports, audio, media)
const foldersFile = () => path.join(app.getPath('userData'), 'folders.json');
let folders: Record<string, string> | null = null;
function lastFolder(kind?: string): string | undefined {
  if (!kind) return undefined;
  if (!folders) { try { folders = JSON.parse(fs.readFileSync(foldersFile(), 'utf8')); } catch { folders = {}; } }
  const f = folders![kind];
  return f && fs.existsSync(f) ? f : undefined;
}
function rememberFolder(kind: string | undefined, file: string) {
  if (!kind) return;
  lastFolder(kind);
  folders![kind] = path.dirname(file);
  fs.promises.writeFile(foldersFile(), JSON.stringify(folders)).catch(() => {});
}

ipcMain.handle('dialog:open', async (_e, opts: { title?: string; filters?: Electron.FileFilter[]; multi?: boolean; kind?: string }) => {
  const r = await dialog.showOpenDialog(win!, {
    title: opts.title,
    defaultPath: lastFolder(opts.kind),
    filters: opts.filters,
    properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile']
  });
  if (!r.canceled && r.filePaths[0]) rememberFolder(opts.kind, r.filePaths[0]);
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog:save', async (_e, opts: { title?: string; defaultPath?: string; filters?: Electron.FileFilter[]; kind?: string; fallbackDir?: string }) => {
  let def = opts.defaultPath;
  // a bare file name goes into the folder used last time for this kind of file
  if (def && path.basename(def) === def) {
    const dir = lastFolder(opts.kind) || (opts.fallbackDir && fs.existsSync(opts.fallbackDir) ? opts.fallbackDir : undefined);
    if (dir) def = path.join(dir, def);
  }
  const r = await dialog.showSaveDialog(win!, { title: opts.title, defaultPath: def, filters: opts.filters });
  if (!r.canceled && r.filePath) rememberFolder(opts.kind, r.filePath);
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('fs:readBinary', async (_e, p: string) => {
  const buf = await fs.promises.readFile(p);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});
ipcMain.handle('fs:readText', async (_e, p: string) => {
  try { return await fs.promises.readFile(p, 'utf8'); } catch { return null; }
});
ipcMain.handle('fs:writeText', async (_e, p: string, text: string) => {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  await fs.promises.writeFile(tmp, text, 'utf8');
  await fs.promises.rename(tmp, p);
  return true;
});
ipcMain.handle('fs:exists', async (_e, p: string) => fs.existsSync(p));
ipcMain.handle('fs:writeBinary', async (_e, p: string, data: Uint8Array) => {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  return true;
});
ipcMain.handle('fs:stat', async (_e, p: string) => { try { const s = await fs.promises.stat(p); return { size: s.size, mtime: s.mtimeMs }; } catch { return null; } });
ipcMain.handle('app:modelPath', async () => app.isPackaged
  ? path.join(process.resourcesPath, 'models', 'depth-anything-v2-small.onnx')
  : path.join(app.getAppPath(), 'models', 'depth-anything-v2-small.onnx'));
ipcMain.handle('app:paths', async () => ({ userData: app.getPath('userData'), videos: app.getPath('videos'), documents: app.getPath('documents') }));
ipcMain.handle('app:showItem', async (_e, p: string) => shell.showItemInFolder(p));
ipcMain.handle('app:quit', async () => { allowClose = true; win?.close(); });
ipcMain.handle('app:takeOpenPath', async () => { const p = pendingOpenPath; pendingOpenPath = null; return p; });

const argPath = process.argv.find((a) => a.toLowerCase().endsWith('.skimo'));
if (argPath) pendingOpenPath = argPath;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = argv.find((a) => a.toLowerCase().endsWith('.skimo'));
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (p) win.webContents.send('app:open-project', p);
    }
  });
  app.whenReady().then(() => {
    registerMediaProtocol();
    createWindow();
  });
  app.on('window-all-closed', () => {
    for (const j of jobs.values()) j.proc.kill('SIGKILL');
    app.quit();
  });
}
