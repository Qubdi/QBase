import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const show = (access: AccessState = editor, enabled = true) =>
    render(
        <qubdiContext.Provider value={{ enabled } as unknown as QubdiContext}>
            <DiagramAccessContext.Provider
                value={{ access, refresh: () => undefined }}
            >
                <ServerSaveStatus />
            </DiagramAccessContext.Provider>
        </qubdiContext.Provider>
    );

describe('ServerSaveStatus', () => {
    afterEach(() => act(() => resetSaveStatus()));

    it('shows nothing before anything happened', () => {
        show();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('says there are unsaved changes while the save is waiting', () => {
        show();
        act(() => setSaveStatus('pending', vi.fn()));
        expect(screen.getByRole('status').textContent).toContain(
            'Unsaved changes'
        );
    });

    it('lets the user save right away instead of waiting', () => {
        const saveNow = vi.fn();
        show();
        act(() => setSaveStatus('pending', saveNow));
        fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
        expect(saveNow).toHaveBeenCalledTimes(1);
    });

    it('shows saving, saved and failure states', () => {
        show();
        act(() => setSaveStatus('saving', vi.fn()));
        expect(screen.getByRole('status').textContent).toContain('Saving');
        act(() => setSaveStatus('saved', vi.fn()));
        expect(screen.getByRole('status').textContent).toContain(
            'Saved to project'
        );
        act(() => setSaveStatus('error', vi.fn()));
        expect(screen.getByText(/Not saved/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });

    it('does not offer Save now once the save has started', () => {
        show();
        act(() => setSaveStatus('saving', vi.fn()));
        expect(screen.queryByRole('button', { name: 'Save now' })).toBeNull();
    });

    it('stays hidden for people who cannot edit, or without a server', () => {
        const { unmount } = show({
            status: 'viewer',
            projectId: 'p',
            remoteId: 'r',
        });
        act(() => setSaveStatus('pending', vi.fn()));
        expect(screen.queryByRole('status')).toBeNull();
        unmount();
        show(editor, false);
        expect(screen.queryByRole('status')).toBeNull();
    });
});
