import { loader } from '@monaco-editor/react';

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';

// The app only shows JSON, SQL, DBML and shell. SQL, DBML and shell are plain
// highlighting; only JSON has a language worker.
self.MonacoEnvironment = {
    getWorker(_, label) {
        if (label === 'json') {
            return new jsonWorker();
        }
        return new editorWorker();
    },
};

loader.config({ monaco });
