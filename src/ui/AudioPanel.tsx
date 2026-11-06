import { useRef, useState } from 'react';
import { useStore, uid, snapTime } from '../store';
import { platform, baseName } from '../platform';
import { analyseProject } from '../projectIO';
import { AUDIO_EXT, redetectLanes } from './actions';
import { analyses, buffers, estimateBpm, estimateOffset, laneDefs, setSolo, getSolo } from '../audio/audio';
import { playback } from '../playback';
import type { AudioRef, StemRole } from '../types';
import { suggestMarkers } from '../generate';
import { fmtTime, NumberInput } from './common';

const ROLES: { id: StemRole; label: string }[] = [
  { id: 'drums', label: 'Drums (full kit)' }, { id: 'kick', label: 'Kick only' }, { id: 'snare', label: 'Snare / clap only' }, { id: 'hats', label: 'Hats / percussion' },
  { id: 'bass', label: 'Bass / 808' }, { id: 'melody', label: 'Melody / synths' }, { id: 'vocals', label: 'Vocals' }, { id: 'fx', label: 'FX' }, { id: 'other', label: 'Other' }
];

function guessRole(name: string): StemRole {
  const n = name.toLowerCase();
  if (/kick|kik|bd/.test(n)) return 'kick';
  if (/snare|clap|sd/.test(n)) return 'snare';
  if (/hat|hh|perc|shaker|ride|cymbal/.test(n)) return 'hats';
  if (/drum|beat|break/.test(n)) return 'drums';
  if (/bass|808|sub/.test(n)) return 'bass';
  if (/vox|vocal|voice|acap/.test(n)) return 'vocals';
  if (/fx|riser|sweep|impact/.test(n)) return 'fx';
  if (/synth|lead|pad|key|piano|chord|melod|guitar|string/.test(n)) return 'melody';
  return 'other';
}

export function AudioPanel() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  useStore((s) => s.analysisVersion);
  const taps = useRef<number[]>([]);
  const [, force] = useState(0);
  const hasAnalysis = analyses.has('mix');

  const loadMaster = async () => {
    const paths = await platform.openFiles({ title: 'Choose your track', filters: [{ name: 'Audio', extensions: AUDIO_EXT }] });
    if (!paths.length) return;
    playback.pause();
    buffers.clear(); analyses.clear();
    update((p) => {
      p.audioMode = 'master';
      p.audio = [{ id: uid(), path: paths[0], name: baseName(paths[0]), role: 'master', volume: 1, muted: false }];
      p.hits = {}; p.hitsEdited = {};
      if (p.name === 'Untitled') p.name = baseName(paths[0]).replace(/\.[^.]+$/, '');
    });
    await analyseProject();
  };

  const addStems = async () => {
    const paths = await platform.openFiles({ title: 'Choose your stems', multi: true, filters: [{ name: 'Audio', extensions: AUDIO_EXT }] });
    if (!paths.length) return;
    playback.pause();
    analyses.delete('mix');
    update((p) => {
      if (p.audioMode !== 'stems') { p.audio = []; p.hits = {}; p.hitsEdited = {}; buffers.clear(); analyses.clear(); }
      p.audioMode = 'stems';
      for (const path of paths) p.audio.push({ id: uid(), path, name: baseName(path).replace(/\.[^.]+$/, ''), role: guessRole(baseName(path)), volume: 1, muted: false });
    });
    await analyseProject();
    redetectLanes();
  };

  const setRef = (id: string, fn: (a: AudioRef) => void, history = true) => update((p) => { const a = p.audio.find((x) => x.id === id); if (a) fn(a); }, history);

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 3) {
      const iv = (taps.current[taps.current.length - 1] - taps.current[0]) / (taps.current.length - 1);
      update((p) => { p.bpm = Math.round((60000 / iv) * 10) / 10; }, false);
    }
    force((x) => x + 1);
  };

  return (
    <>
      <h3>Your track</h3>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={project.audioMode === 'master' ? 'active' : ''} onClick={() => project.audioMode !== 'master' && (project.audio.length === 0 || confirm('Switch to a single master file? Your stems will be removed.')) && update((p) => { p.audioMode = 'master'; p.audio = []; p.hits = {}; buffers.clear(); analyses.clear(); })}>Master file</button>
        <button className={project.audioMode === 'stems' ? 'active' : ''} onClick={() => project.audioMode !== 'stems' && (project.audio.length === 0 || confirm('Switch to stems? Your master file will be removed.')) && update((p) => { p.audioMode = 'stems'; p.audio = []; p.hits = {}; buffers.clear(); analyses.clear(); })}>Stems</button>
      </div>
      {project.audioMode === 'master' ? (
        <div className="col">
          <div className="muted small">Load your finished mix. Kicks, snares, hats and levels are detected for you.</div>
          {project.audio[0] && <div className="hint">♫ {project.audio[0].name}<br />{fmtTime(project.duration)} long</div>}
          <button className="primary" onClick={loadMaster}>{project.audio.length ? 'Replace track…' : 'Load track (WAV, MP3, FLAC)…'}</button>
        </div>
      ) : (
        <div className="col">
          <div className="muted small">Load each stem exported from your DAW. Tell it what each one is so the right parts drive the visuals. All stems should start at the same point.</div>
          {project.audio.map((a) => (
            <div key={a.id} className="hint" style={{ margin: 0 }}>
              <div className="row">
                <b className="grow" style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</b>
                <button className={'iconbtn' + (getSolo() === a.id ? ' on' : '')} title="Solo" onClick={() => { setSolo(getSolo() === a.id ? null : a.id); playback.refreshAudio(); force((x) => x + 1); }}>S</button>
                <button className={'iconbtn' + (a.muted ? ' on' : '')} title="Mute" onClick={() => { setRef(a.id, (x) => { x.muted = !x.muted; }); setTimeout(() => playback.refreshAudio()); }}>M</button>
                <button className="iconbtn" title="Remove" onClick={async () => { update((p) => { p.audio = p.audio.filter((x) => x.id !== a.id); }); buffers.delete(a.id); analyses.delete(a.id); analyses.delete('mix'); await analyseProject(); redetectLanes(); }}>×</button>
              </div>
              <div className="row" style={{ marginTop: 4 }}>
                <select value={a.role} onChange={(e) => { setRef(a.id, (x) => { x.role = e.target.value as StemRole; }); redetectLanes(); }}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <input type="range" min={0} max={1.5} step={0.01} value={a.volume} title="Volume" onChange={(e) => setRef(a.id, (x) => { x.volume = Number(e.target.value); }, false)} onMouseUp={() => playback.refreshAudio()} />
              </div>
            </div>
          ))}
          <button className="primary" onClick={addStems}>Add stems…</button>
        </div>
      )}

      <h4>Tempo</h4>
      <div className="kv">
        <label>BPM</label>
        <div className="row">
          <NumberInput value={project.bpm} min={30} max={300} step={0.1} decimals={2} onCommit={(v) => update((p) => { p.bpm = v; })} />
          <button className="small" onClick={tap} title="Tap along with the beat">Tap</button>
          <button className="small" disabled={!hasAnalysis} onClick={() => { const b = estimateBpm(); if (b) update((p) => { p.bpm = b; }); }} title="Guess the tempo">Detect</button>
        </div>
        <label>Beats per bar</label>
        <select value={project.beatsPerBar} onChange={(e) => update((p) => { p.beatsPerBar = Number(e.target.value); })}>
          {[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>First beat at</label>
        <div className="row">
          <NumberInput value={project.beatOffset} min={0} step={0.001} decimals={3} onCommit={(v) => update((p) => { p.beatOffset = v; })} />
          <span className="small muted">sec</span>
          <button className="small" onClick={() => update((p) => { p.beatOffset = playback.time; })} title="Use the playhead position">Playhead</button>
        </div>
        <span />
        <button className="small" disabled={!project.hits.kick?.length} onClick={() => update((p) => { p.beatOffset = estimateOffset(p.bpm, p.hits.kick || []); })}>Line the grid up with the kicks</button>
      </div>
      <div className="muted tiny" style={{ marginTop: 4 }}>Type your BPM in. Halftime trap at 70 or 140 both work; it just changes how often beat effects fire.</div>

      <h4>Sections</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>Mark your intro, build, drop and so on. Visuals can change at each one. Press M to drop a marker at the playhead.</div>
      <div className="col" style={{ gap: 4 }}>
        {project.markers.map((m) => (
          <div key={m.id} className="row">
            <input type="color" value={m.colour} onChange={(e) => update((p) => { const x = p.markers.find((y) => y.id === m.id); if (x) x.colour = e.target.value; }, false)} />
            <input className="grow" value={m.name} onChange={(e) => update((p) => { const x = p.markers.find((y) => y.id === m.id); if (x) x.name = e.target.value; }, false)} />
            <button className="ghost small" onClick={() => playback.seek(m.t)}>{fmtTime(m.t, true)}</button>
            <button className="iconbtn" onClick={() => update((p) => { p.markers = p.markers.filter((x) => x.id !== m.id); })}>×</button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="small" onClick={() => { const t = useStore.getState().snap ? snapTime(project, playback.time) : playback.time; update((p) => { p.markers.push({ id: uid(), t, name: 'Drop', colour: '#ff9ec7' }); p.markers.sort((a, b) => a.t - b.t); }); }}>+ Marker at playhead</button>
        <button className="small" disabled={!hasAnalysis} onClick={() => { if (project.markers.length && !confirm('Replace your markers with suggested ones?')) return; update((p) => { p.markers = suggestMarkers(p); }); }}>Suggest sections</button>
      </div>

      <h4>Hit detection</h4>
      <div className="muted small" style={{ marginBottom: 6 }}>If it is picking up too much or too little, adjust the sensitivity. On the timeline, click a lane to add a hit and right click a hit to remove it.</div>
      {laneDefs(project).map((l) => (
        <div key={l.id} className="row" style={{ marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: l.colour, flexShrink: 0 }} />
          <span className="small" style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
          <input type="range" min={0} max={1} step={0.01} value={project.detection[l.id]?.sensitivity ?? 0.5}
            onChange={(e) => update((p) => { p.detection[l.id] = { sensitivity: Number(e.target.value) }; }, false)}
            onMouseUp={() => redetectLanes(true, l.id)} title="Sensitivity" />
          <span className="tiny muted" style={{ width: 34 }}>{project.hits[l.id]?.length ?? 0}</span>
          {project.hitsEdited[l.id] && <button className="iconbtn" title="You edited this lane. Click to detect again and lose your edits." onClick={() => confirm('Detect again and lose your hand edits on this lane?') && redetectLanes(true, l.id)}>↺</button>}
        </div>
      ))}
    </>
  );
}
