// Works out bitrates and file sizes for exporting, so the size shown is the size you get.
export type Quality = 'draft' | 'small' | 'high' | 'max';

export const DRAFT_LIMIT_MB = 180;
const AUDIO_KBPS: Record<Quality, number> = { draft: 128, small: 192, high: 320, max: 320 };

export interface ExportPlan { width: number; height: number; videoKbps: number; audioKbps: number; sizeMB: number; scaledDown: boolean; }

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Bitrate for a quality level, scaled from a 1080p, 30fps baseline */
function baseKbps(q: Exclude<Quality, 'draft'>, w: number, h: number, fps: number) {
  const pixels = (w * h) / (1920 * 1080);
  const motion = fps > 30 ? 1.4 : 1;
  const per1080 = q === 'small' ? 6000 : q === 'high' ? 12000 : 24000;
  return Math.round(per1080 * Math.pow(pixels, 0.85) * motion);
}

export function planExport(q: Quality, width: number, height: number, fps: number, duration: number, keepFullSize = false): ExportPlan {
  const dur = Math.max(0.5, duration);
  const audioKbps = AUDIO_KBPS[q];
  if (q !== 'draft') {
    const videoKbps = baseKbps(q, width, height, fps);
    return { width, height, videoKbps, audioKbps, sizeMB: ((videoKbps + audioKbps) * dur) / 8 / 1000, scaledDown: false };
  }
  // draft: the best quality that fits under the limit, with a margin for the encoder
  const budgetKbps = (DRAFT_LIMIT_MB * 0.93 * 8 * 1000) / dur - audioKbps;
  let w = width, h = height, scaledDown = false;
  const highKbps = baseKbps('high', w, h, fps);
  let videoKbps = Math.min(highKbps, Math.floor(budgetKbps));
  // when the bitrate would be starved, a smaller picture looks better than a blocky big one
  const needed = baseKbps('small', w, h, fps) * 0.45;
  if (!keepFullSize && videoKbps < needed && Math.min(w, h) > 720) {
    const k = 720 / Math.min(w, h);
    w = even(w * k); h = even(h * k);
    scaledDown = true;
    videoKbps = Math.min(baseKbps('high', w, h, fps), Math.floor(budgetKbps));
  }
  videoKbps = Math.max(300, videoKbps);
  return { width: w, height: h, videoKbps, audioKbps, sizeMB: ((videoKbps + audioKbps) * dur) / 8 / 1000, scaledDown };
}

export function fmtMB(mb: number) {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}
