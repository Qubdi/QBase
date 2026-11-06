import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

// Hand the Monaco copy bundled with the app to the loader, so it never goes to
// a CDN. Only the plain editor worker is needed (no language services).
self.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
};

loader.config({ monaco });
