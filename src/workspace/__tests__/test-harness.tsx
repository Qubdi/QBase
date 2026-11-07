import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/platform/ui/tooltip';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/platform/theme/theme-provider';
import { DialogProvider } from '@/context/dialog-context/dialog-provider';
import { localDiagramsOver } from '@/qbase/local-diagrams';
import { StorageContext } from '@/qbase/storage-context';
import { StoreContext } from '@/store/store-context';
import { blank } from '@/core/testing/helpers';
import { createEditorStore } from '@/store/editor-store';
import type { EditorStoreOptions } from '@/store/editor-store';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { CanvasBridgeProvider } from '../canvas-bridge';

export interface Harness {
    adapter: MemoryStorageAdapter;
    store: ReturnType<typeof createEditorStore>;
}

/** Everything the editor frame parts need, around an in-memory storage and a fresh store. */
export function renderInEditor(
    ui: React.ReactElement,
    options: EditorStoreOptions | null,
    path = '/diagrams/x',
    adapter = new MemoryStorageAdapter(),
    wrap: (node: React.ReactElement) => React.ReactElement = (node) => node
): Harness & ReturnType<typeof render> {
    const store = createEditorStore(options ?? { design: blank() });
    const view = render(
        <MemoryRouter initialEntries={[path]}>
            <LocalConfigProvider>
                <ThemeProvider>
                    <TooltipProvider>
                        <StorageContext.Provider
                            value={{
                                adapter,
                                diagrams: localDiagramsOver(adapter),
                            }}
                        >
                            <CanvasBridgeProvider>
                                <StoreContext.Provider
                                    value={options ? store : null}
                                >
                                    {wrap(
                                        <DialogProvider>{ui}</DialogProvider>
                                    )}
                                </StoreContext.Provider>
                            </CanvasBridgeProvider>
                        </StorageContext.Provider>
                    </TooltipProvider>
                </ThemeProvider>
            </LocalConfigProvider>
        </MemoryRouter>
    );
    return { ...view, adapter, store };
}
