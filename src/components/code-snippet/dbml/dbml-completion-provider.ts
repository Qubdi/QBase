import type { Monaco } from '@monaco-editor/react';
import type { IDisposable, languages } from 'monaco-editor';
import {
    Compiler,
    DBMLCompletionItemProvider,
    Filepath,
    MemoryProjectLayout,
} from '@dbml/parse';

/**
 * Creates and manages a DBML completion provider using @dbml/parse.
 *
 * The compiler reads sources from an in-memory project layout. Before each
 * completion request the editor model's text is written into that layout under
 * the model's own URI, so the compiler always sees what the editor shows.
 */
export interface DBMLCompletionManager {
    /** Disposable to clean up the completion provider registration */
    dispose: () => void;
}

// Trigger characters for DBML completions
const TRIGGER_CHARACTERS = [' ', '[', ':', '.', '>', '<', '-'];

/**
 * Registers a DBML completion provider with Monaco editor.
 *
 * Uses @dbml/parse's built-in DBMLCompletionItemProvider which provides:
 * - Context-aware keyword suggestions (Table, Ref, Enum, etc.)
 * - Symbol suggestions based on parsed DBML (table names, column names)
 * - Field setting suggestions (pk, not null, unique, etc.)
 * - Ref operator suggestions (>, <, -, <>)
 *
 * @param monaco - Monaco editor instance
 * @returns Manager object with a dispose method
 */
export function registerDBMLCompletionProvider(
    monaco: Monaco
): DBMLCompletionManager {
    const layout = new MemoryProjectLayout();
    const completionProvider = new DBMLCompletionItemProvider(
        new Compiler(layout),
        { triggerCharacters: TRIGGER_CHARACTERS }
    );

    const provider: languages.CompletionItemProvider = {
        triggerCharacters: completionProvider.triggerCharacters,
        provideCompletionItems: (model, position) => {
            layout.setSource(
                Filepath.fromUri(String(model.uri)),
                model.getValue()
            );
            return completionProvider.provideCompletionItems(model, position);
        },
    };

    const disposable: IDisposable =
        monaco.languages.registerCompletionItemProvider('dbml', provider);

    return { dispose: () => disposable.dispose() };
}
