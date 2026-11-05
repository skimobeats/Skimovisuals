// Electron has no window.prompt, so this provides a small text input dialog instead.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Dialog } from './common';

interface PromptState { req: { title: string; value: string; resolve: (v: string | null) => void } | null; }
const usePrompt = create<PromptState>(() => ({ req: null }));

export function askText(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ req: { title, value, resolve } }));
}

export function PromptHost() {
  const req = usePrompt((s) => s.req);
  const [v, setV] = useState('');
  useEffect(() => { if (req) setV(req.value); }, [req]);
  if (!req) return null;
  const done = (val: string | null) => { usePrompt.setState({ req: null }); req.resolve(val); };
  return (
    <Dialog title={req.title} onClose={() => done(null)} width={400}>
      <input autoFocus style={{ width: '100%' }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(v.trim() || null); if (e.key === 'Escape') done(null); }} />
      <div className="actions">
        <button onClick={() => done(null)}>Cancel</button>
        <button className="primary" onClick={() => done(v.trim() || null)}>OK</button>
      </div>
    </Dialog>
  );
}
