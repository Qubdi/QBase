import './setup';
import React from 'react';
import { render } from '@testing-library/react';
import type { Design } from '@/core/model/design';
import { EditorStoreProvider } from '@/store/editor-provider';
import type { EditorStoreProviderProps } from '@/store/editor-provider';
import { useEditorStoreApi } from '@/store/store-context';
import type { EditorStore } from '@/store/editor-store';
import { DiagramCanvas } from '../diagram-canvas';
import type { DiagramCanvasProps } from '../diagram-canvas';

/** Renders the canvas over a real store and hands the store back. */
export function renderCanvas(
    design: Design,
    options: {
        canvas?: DiagramCanvasProps;
        store?: Partial<EditorStoreProviderProps>;
    } = {}
) {
    let store!: EditorStore;
    const Grab = () => {
        store = useEditorStoreApi();
        return null;
    };
    const view = render(
        <EditorStoreProvider design={design} {...options.store}>
            <Grab />
            <div style={{ width: 1000, height: 800 }}>
                <DiagramCanvas {...options.canvas} />
            </div>
        </EditorStoreProvider>
    );
    return { ...view, store };
}
