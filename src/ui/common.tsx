import { ReactNode, useEffect, useState } from 'react';
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

/**
 * A number box you can type into freely. The value is only checked and saved
 * when you press Enter, click away, or use the arrow buttons.
 */
export function NumberInput({ value, onCommit, min, max, step = 1, width = 70, decimals, title, onFocus, className, plain }: {
  value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number; width?: number; decimals?: number; title?: string; onFocus?: () => void; className?: string; plain?: boolean;
}) {
  const fmt = (v: number) => (decimals !== undefined ? String(Number(v.toFixed(decimals))) : String(v));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(fmt(value)); }, [value, editing]);
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v)) { setText(fmt(value)); return; }
    const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
    setText(fmt(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <input type={plain ? 'text' : 'number'} className={className} style={className ? undefined : { width }} value={text} step={step} min={min} max={max} title={title}
      onFocus={() => { setEditing(true); onFocus?.(); }}
      onChange={(e) => {
        setText(e.target.value);
        // the little up and down arrows should apply straight away
        const ie = (e.nativeEvent as InputEvent).inputType;
        if (!ie) commit(e.target.value);
      }}
      onBlur={(e) => { setEditing(false); commit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setText(fmt(value)); (e.target as HTMLInputElement).blur(); }
      }} />
  );
}
