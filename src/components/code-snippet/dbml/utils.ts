import type { DBMLError } from '@/lib/dbml/dbml-import/dbml-import-error';
import type * as monaco from 'monaco-editor';

/** `monaco.editor.OverviewRulerLane.Right`, without importing Monaco for one number. */
const OVERVIEW_RULER_RIGHT = 4 as monaco.editor.OverviewRulerLane;

export const highlightErrorLine = ({
    error,
    model,
    editorDecorationsCollection,
}: {
    error: DBMLError;
    model?: monaco.editor.ITextModel | null;
    editorDecorationsCollection:
        monaco.editor.IEditorDecorationsCollection | undefined;
}) => {
    if (!model) return;
    if (!editorDecorationsCollection) return;

    const decorations = [
        {
            // a plain range: building a monaco.Range would pull Monaco into this file's chunk
            range: {
                startLineNumber: error.line,
                startColumn: 1,
                endLineNumber: error.line,
                endColumn: model.getLineMaxColumn(error.line),
            },
            options: {
                isWholeLine: true,
                className: 'dbml-error-line',
                glyphMarginClassName: 'dbml-error-glyph',
                hoverMessage: { value: error.message },
                overviewRuler: {
                    color: '#ff0000',
                    position: OVERVIEW_RULER_RIGHT,
                    darkColor: '#ff0000',
                },
            },
        },
    ];

    editorDecorationsCollection?.set(decorations);
};

export const clearErrorHighlight = (
    editorDecorationsCollection:
        monaco.editor.IEditorDecorationsCollection | undefined
) => {
    if (editorDecorationsCollection) {
        editorDecorationsCollection.clear();
    }
};
