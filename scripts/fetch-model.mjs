// Downloads the depth estimation model used to place 3D shapes into photos.
// Depth Anything V2 Small (Apache 2.0), pinned to an exact revision and checked by its fingerprint.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'models', 'depth-anything-v2-small.onnx');
const REV = '4472b7362082ad9968fee890ca0f1e5aca36b93d';
const URL_ = `https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/${REV}/onnx/model.onnx`;
const SHA256 = 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

if (existsSync(out) && sha(readFileSync(out)) === SHA256) {
  console.log('Depth model already present.');
  process.exit(0);
}
mkdirSync(dirname(out), { recursive: true });
const tmp = out + '.part';
console.log('Downloading the depth model (about 100 MB)…');
let ok = false;
try {
  const res = await fetch(URL_);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  ok = true;
} catch (e) {
  console.log('Direct download failed (' + e.message + '), trying curl…');
  try { execFileSync('curl', ['-sSfL', '--retry', '3', '-o', tmp, URL_], { stdio: 'inherit' }); ok = true; } catch { ok = false; }
}
if (!ok || sha(readFileSync(tmp)) !== SHA256) {
  if (existsSync(tmp)) unlinkSync(tmp);
  console.error('Could not download the depth model, or it did not match the expected file.');
  process.exit(1);
}
renameSync(tmp, out);
console.log('Depth model ready.');
