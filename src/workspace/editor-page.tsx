import React from 'react';
import { AccessBanner } from '@/components/qubdi/access-banner';
import { AccountMenu } from '@/components/qubdi/account-menu';
import { DiagramAccessGate } from '@/components/qubdi/diagram-access';
import { DriftControl } from '@/components/qubdi/drift-control';
import { GetLatestControl } from '@/components/qubdi/get-latest-control';
import { LintControl } from '@/components/qubdi/lint-control';
import { PublishControl } from '@/components/qubdi/publish-control';
import {
    ServerAutosave,
    ServerSaveStatus,
} from '@/components/qubdi/server-autosave';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { LastSaved } from '@/pages/editor-page/top-navbar/last-saved';
import { StorageProvider } from '@/qbase/storage-provider';
import { Toaster } from '@/platform/toast/toaster';
import { ThemeProvider } from '@/platform/theme/theme-provider';

/** A named place in the frame where a part is mounted (spec B2). */
const Slot: React.FC<
    React.PropsWithChildren<{ name: string; className?: string }>
> = ({ name, className, children }) => (
    <div data-slot={name} className={className}>
        {children}
    </div>
);

/**
 * The editor page. Wrapper order (spec C23): local config, theme, storage,
 * the QBase access gate (which supplies the readonly flag and mounts the
 * diagram store), then the frame.
 */
export const EditorPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <StorageProvider>
                <DiagramAccessGate>
                    <EditorFrame />
                </DiagramAccessGate>
            </StorageProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);

const EditorFrame: React.FC = () => (
    <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <Slot name="navbar-left" className="flex items-center gap-2" />
            <Slot name="navbar-right" className="flex items-center gap-2">
                <ServerSaveStatus fallback={<LastSaved />} />
                <GetLatestControl />
                <LintControl />
                <DriftControl />
                <PublishControl />
                <AccountMenu />
            </Slot>
        </header>
        <Slot name="below-navbar" className="shrink-0 empty:hidden">
            <AccessBanner />
        </Slot>
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Editor under construction
        </main>
        <ServerAutosave />
        <Toaster />
    </div>
);
