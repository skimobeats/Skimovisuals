import { useEffect, useState } from 'react';
import { useStore } from './store';
import { platform } from './platform';
import { openProjectFile, saveProject, startAutosave, autosavePath } from './projectIO';
import { Welcome } from './ui/Welcome';
import { Editor } from './ui/Editor';
import { BusyOverlay, Toast } from './ui/common';
import { PromptHost } from './ui/prompt';

export default function App() {
  const project = useStore((s) => s.project);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    platform.onCloseRequest(async () => {
      const { dirty, project } = useStore.getState();
      if (project && dirty) {
        const save = confirm('You have unsaved changes. Save before closing?\n\nOK = save, Cancel = choose whether to discard');
        if (save) { if (!(await saveProject())) return; }
        else if (!confirm('Close without saving?')) return;
      }
      platform.quit();
    });
    platform.onOpenProject((p) => openProjectFile(p));
    platform.takeOpenPath().then((p) => { if (p) openProjectFile(p); setReady(true); });
    startAutosave();
  }, []);

  if (!ready) return null;
  return (
    <>
      {project ? <Editor /> : <Welcome autosavePath={autosavePath} />}
      <BusyOverlay />
      <Toast />
      <PromptHost />
    </>
  );
}
