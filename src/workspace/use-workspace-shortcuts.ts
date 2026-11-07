import { useEffect } from 'react';
import { getOperatingSystem } from '@/lib/utils/utils';
import { isTextBox, matchShortcut } from './shortcuts';
import type { WorkspaceCommands } from './use-workspace-commands';

/** A modal dialog is open: only the theme key still works behind it. */
const modalOpen = (): boolean =>
    document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    ) !== null;

/** Listens for the workspace's keyboard shortcuts on the whole page. */
export function useWorkspaceShortcuts(commands: WorkspaceCommands): void {
    useEffect(() => {
        const mac = getOperatingSystem() === 'mac';
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = matchShortcut(event, {
                mac,
                inTextBox: isTextBox(event.target),
            });
            if (!shortcut || shortcut.owner !== 'workspace') return;
            if (modalOpen() && shortcut.id !== 'toggleTheme') return;
            const run = commands[shortcut.id];
            if (!run) return;
            if (shortcut.cancelsBrowser) event.preventDefault();
            run();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [commands]);
}
