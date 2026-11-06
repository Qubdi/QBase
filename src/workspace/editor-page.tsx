import React from 'react';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { ThemeProvider } from '@/platform/theme/theme-provider';

/** Empty named slots: the QBase controls (B2) are mounted here in a later phase. */
const Slot: React.FC<{ name: string; className?: string }> = ({
    name,
    className,
}) => <div data-slot={name} className={className} />;

/** The editor frame: navbar with its slots, a row under it, and the canvas area. */
export const EditorPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <EditorFrame />
        </ThemeProvider>
    </LocalConfigProvider>
);

const EditorFrame: React.FC = () => (
    <div className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <Slot name="navbar-left" className="flex items-center gap-2" />
            <Slot name="navbar-right" className="flex items-center gap-2" />
        </header>
        <Slot name="below-navbar" className="shrink-0 empty:hidden" />
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Editor under construction
        </main>
    </div>
);
