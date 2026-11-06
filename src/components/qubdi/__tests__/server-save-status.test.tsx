import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/platform/ui/tooltip';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { AccessState } from '@/lib/qubdi/access';
import { resetSaveStatus, setSaveStatus } from '@/lib/qubdi/save-status-store';
import { DiagramAccessContext } from '../diagram-access-context';
import { ServerSaveStatus } from '../server-autosave';

const editor: AccessState = {
    status: 'editor',
    projectId: 'p',
    remoteId: 'r',
};

const show = (
    access: AccessState = editor,
    enabled = true,
    fallback?: React.ReactNode
) =>
    render(
        <TooltipProvider>
            <qubdiContext.Provider
                value={{ enabled } as unknown as QubdiContext}
            >
                <DiagramAccessContext.Provider
                    value={{ access, refresh: () => undefined }}
                >
                    <ServerSaveStatus fallback={fallback} />
                </DiagramAccessContext.Provider>
            </qubdiContext.Provider>
        </TooltipProvider>
    );

describe('ServerSaveStatus', () => {
    afterEach(() => act(() => resetSaveStatus()));

    it('shows nothing before anything happened', () => {
        show();
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('shows the fallback until there is something to report', () => {
        show(editor, true, <span>last saved</span>);
        expect(screen.getByText('last saved')).toBeTruthy();
        act(() => setSaveStatus('pending', vi.fn()));
        expect(screen.queryByText('last saved')).toBeNull();
    });

    it('says there are unsaved changes while the save is waiting', () => {
        show();
        act(() => setSaveStatus('pending', vi.fn()));
        expect(
            screen.getByRole('button', { name: /Unsaved changes/ })
        ).toBeTruthy();
    });

    it('lets the user save right away instead of waiting', () => {
        const saveNow = vi.fn();
        show();
        act(() => setSaveStatus('pending', saveNow));
        fireEvent.click(screen.getByRole('button', { name: /save now/ }));
        expect(saveNow).toHaveBeenCalledTimes(1);
    });

    it('is a lone icon: the words live in the tooltip and the label', () => {
        show();
        act(() => setSaveStatus('pending', vi.fn()));
        expect(screen.getByRole('button').textContent).toBe('');
        act(() => setSaveStatus('saved', vi.fn()));
        expect(screen.getByRole('status').textContent).toBe('');
    });

    it('shows saving, saved and failure states', () => {
        show();
        act(() => setSaveStatus('saving', vi.fn()));
        expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
            'Saving…'
        );
        act(() => setSaveStatus('saved', vi.fn()));
        expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
            'Saved to project'
        );
        act(() => setSaveStatus('error', vi.fn()));
        expect(
            screen.getByRole('button', { name: /Not saved.*try again/ })
        ).toBeTruthy();
    });

    it('retries a failed save from the icon', () => {
        const retry = vi.fn();
        show();
        act(() => setSaveStatus('error', retry));
        fireEvent.click(screen.getByRole('button', { name: /Not saved/ }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('says when someone else saved first and offers to overwrite', () => {
        const overwrite = vi.fn();
        show();
        act(() => setSaveStatus('error', vi.fn(), overwrite));
        expect(screen.getByRole('alert').textContent).toContain(
            'Someone else saved a newer version'
        );
        // a plain failure is not the same thing
        expect(screen.queryByRole('button', { name: /Not saved/ })).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Overwrite with mine' })
        );
        expect(overwrite).toHaveBeenCalledTimes(1);
    });

    it('does not offer to save once the save has started', () => {
        show();
        act(() => setSaveStatus('saving', vi.fn()));
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('stays hidden for people who cannot edit, or without a server', () => {
        const { unmount } = show({
            status: 'viewer',
            projectId: 'p',
            remoteId: 'r',
        });
        act(() => setSaveStatus('pending', vi.fn()));
        expect(screen.queryByRole('button')).toBeNull();
        unmount();
        show(editor, false);
        expect(screen.queryByRole('button')).toBeNull();
    });
});
