import { ReactNode } from 'react';
import { useStore } from '../store';
import type { Palette } from '../types';

export function fmtTime(t: number, withFrames = false) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(withFrames ? 2 : 0).padStart(withFrames ? 5 : 2, '0')}`;
}

export function fmtBars(t: number, bpm: number, offset: number, bpb: number) {
  const beats = (t - offset) / (60 / bpm);
  if (beats < 0) return '0.0';
  const bar = Math.floor(beats / bpb) + 1;
  const beat = Math.floor(beats % bpb) + 1;
  return `${bar}.${beat}`;
}

export function BusyOverlay() {
  const busy = useStore((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="overlay">
      <div className="dialog" style={{ width: 380 }}>
        <h2>{busy.msg}</h2>
        <div className="progress"><div style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div>
        <p className="muted small">Working out the kicks, snares, hats and levels in your track.</p>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}

export function Dialog({ title, children, onClose, width }: { title: string; children: ReactNode; onClose?: () => void; width?: number }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="dialog" style={width ? { width } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PaletteStrip({ palette, width }: { palette: Palette; width?: number }) {
  return (
    <div className="palette-strip" style={width ? { width } : undefined}>
      {palette.colours.map((c, i) => <div key={i} style={{ background: c }} />)}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <><label className="small">{label}</label><div className="row">{children}</div></>;
}
