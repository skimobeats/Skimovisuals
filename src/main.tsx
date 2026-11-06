import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/archivo/wdth.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Handy hooks for automated testing and troubleshooting from the dev tools console
import { useStore } from './store';
import { analyseProject, saveProject, openProjectFile } from './projectIO';
import { generate } from './generate';
import { ExportJob } from './exporter';
import * as audioMod from './audio/audio';
import { importMediaPaths } from './ui/actions';
import { playback } from './playback';
import { ALL_LAYERS } from './engine/registry';
import { makeClip } from './store';
(window as any).__skimoLayers = ALL_LAYERS;
import * as sceneMod from './scene/scene';
import * as introsMod from './intros';
(window as any).__skimoIntros = introsMod;
(window as any).__skimoScene = sceneMod;
(window as any).__skimoMakeClip = makeClip;
(window as any).__skimo = { useStore, analyseProject, generate, ExportJob, audio: audioMod, importMediaPaths, playback, saveProject, openProjectFile };
