import React from 'react';
import { DiagramAccessGate } from '@/components/qubdi/diagram-access';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { DialogProvider } from '@/context/dialog-context/dialog-provider';
import { StorageProvider } from '@/qbase/storage-provider';
import { ThemeProvider } from '@/platform/theme/theme-provider';
import { CanvasBridgeProvider } from './canvas-bridge';
import { EditorFrame } from './editor-frame';
import { StartFlow } from './start-flow';
import '@/i18n/editor/register';

/**
 * The editor page. Wrapper order (spec C23): local config, theme, storage,
 * the QBase access gate (which supplies the readonly flag and mounts the
 * diagram store), then the frame. The toasts are mounted once at the app root.
 * When no diagram can be opened the gate shows the start flow instead.
 */
export const EditorPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <StorageProvider>
                <CanvasBridgeProvider>
                    <DiagramAccessGate
                        fallback={
                            <DialogProvider>
                                <StartFlow />
                            </DialogProvider>
                        }
                    >
                        <DialogProvider>
                            <EditorFrame />
                        </DialogProvider>
                    </DiagramAccessGate>
                </CanvasBridgeProvider>
            </StorageProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);
