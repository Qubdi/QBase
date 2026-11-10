import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { ApiError } from '@/lib/qubdi/api';
import { Toaster } from '@/platform/toast/toaster';
import { DiagramAccessContext } from '../diagram-access-context';
import { PublishControl } from '../publish-control';

const getPublishStatus = vi.fn();
const publish = vi.fn();
const syncDiagram = vi.fn(async () => 'r1');
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        getPublishStatus: (...a: unknown[]) => getPublishStatus(...a),
        publish: (...a: unknown[]) => publish(...a),
        updateDiagram: vi.fn(),
    },
}));
vi.mock('@/lib/qubdi/editor-id', () => ({ getEditorId: () => 'tab-1' }));
vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: 'local-1' } }),
}));

const show = () =>
    render(
        <qubdiContext.Provider
            value={
                {
                    enabled: true,
                    user: { email: 'a@b.c' },
                    remoteIdFor: () => 'r1',
                    syncDiagram,
                } as unknown as QubdiContext
            }
        >
            <DiagramAccessContext.Provider
                value={{
                    access: {
                        status: 'editor',
                        projectId: 'p1',
                        remoteId: 'r1',
                    },
                    refresh: () => undefined,
                }}
            >
                <PublishControl />
                <Toaster />
            </DiagramAccessContext.Provider>
        </qubdiContext.Provider>
    );

const publishWithNote = async (note?: string) => {
    fireEvent.click(await screen.findByRole('button', { name: /^Publish\./ }));
    if (note) {
        const box = await screen.findByRole('textbox');
        fireEvent.change(box, { target: { value: note } });
    }
    const submit = (
        await screen.findAllByRole('button', { name: 'Publish' })
    ).find((b) => b.getAttribute('type') === 'submit')!;
    fireEvent.click(submit);
};

beforeEach(() => {
    getPublishStatus.mockReset();
    publish.mockReset();
    getPublishStatus.mockResolvedValue({
        publishedVersion: 1,
        unpublishedChanges: true,
        autoPublish: false,
    });
});

describe('QBS-032 publishing: optional note, success toast, red failure with the server message', () => {
    it('sends the trimmed note and says "Published v<n>"', async () => {
        publish.mockResolvedValue({ version: 2 });
        show();
        await publishWithNote('  first cut  ');
        await waitFor(() =>
            expect(publish).toHaveBeenCalledWith('r1', 'first cut')
        );
        expect(await screen.findByText('Published v2')).toBeInTheDocument();
    });

    it('sends no note when none was typed', async () => {
        publish.mockResolvedValue({ version: 2 });
        show();
        await publishWithNote();
        await waitFor(() =>
            expect(publish).toHaveBeenCalledWith('r1', undefined)
        );
    });

    it('a failure shows the server message in a destructive toast and keeps the dialog usable', async () => {
        publish.mockRejectedValue(
            new ApiError(423, 'locked', 'raw server text')
        );
        show();
        await publishWithNote();
        expect(await screen.findByText('Publish failed')).toBeInTheDocument();
        expect(
            screen.getByText('Someone else is editing this diagram.')
        ).toBeInTheDocument();
        expect(screen.queryByText('Published v2')).toBeNull();
    });
});
