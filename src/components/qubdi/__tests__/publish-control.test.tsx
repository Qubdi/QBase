import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { PublishControl } from '../publish-control';
import {
    registerFlushNow,
    resetSaveStatus,
    setSaveStatus,
} from '@/lib/qubdi/save-status-store';
import { DiagramAccessContext } from '../diagram-access-context';
import { fireEvent, waitFor } from '@testing-library/react';
import { getBaseUpdatedAt } from '@/lib/qubdi/remote-version';

const getPublishStatus = vi.fn();
const publish = vi.fn();
const updateDiagram = vi.fn();
const calls: string[] = [];
const syncDiagram = vi.fn(async () => {
    calls.push('sync');
    return 'r1';
});
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        getPublishStatus: (...a: unknown[]) => getPublishStatus(...a),
        publish: (...a: unknown[]) => publish(...a),
        updateDiagram: (...a: unknown[]) => updateDiagram(...a),
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
            </DiagramAccessContext.Provider>
        </qubdiContext.Provider>
    );

describe('PublishControl status', () => {
    beforeEach(() => {
        getPublishStatus.mockReset();
    });

    it('is a badge inside the Publish button, with the full sentence on hover', async () => {
        getPublishStatus.mockResolvedValue({
            publishedVersion: 3,
            unpublishedChanges: true,
            autoPublish: false,
        });
        show();
        const badge = await screen.findByText('v3 •');
        expect(screen.getByTestId('publish-status')).toBe(badge);
        const button = badge.closest('button')!;
        expect(button.textContent).toContain('Publish');
        expect(button.getAttribute('title')).toBe(
            'Published v3, unpublished changes'
        );
        expect(button.getAttribute('aria-label')).toBe(
            'Publish. Published v3, unpublished changes'
        );
    });

    it('shows just the version once everything is published', async () => {
        getPublishStatus.mockResolvedValue({
            publishedVersion: 3,
            unpublishedChanges: false,
            autoPublish: false,
        });
        show();
        expect((await screen.findByText('v3')).closest('button')).toBeTruthy();
    });

    it('is a bare dot, with the words in the name, until it has heard from the server', () => {
        getPublishStatus.mockReturnValue(new Promise(() => undefined));
        show();
        expect(screen.getByTestId('publish-status').textContent).toBe('');
        expect(
            screen.getByRole('button', {
                name: 'Publish. Not synced to server',
            })
        ).toBeTruthy();
    });

    it('is a bare dot before the first publish', async () => {
        getPublishStatus.mockResolvedValue({
            publishedVersion: null,
            unpublishedChanges: true,
            autoPublish: false,
        });
        show();
        expect(
            await screen.findByRole('button', {
                name: 'Publish. Not published',
            })
        ).toBeTruthy();
        expect(screen.getByTestId('publish-status').textContent).toBe('');
    });
});

describe('PublishControl publishing', () => {
    beforeEach(() => {
        getPublishStatus.mockReset();
        publish.mockReset();
        syncDiagram.mockClear();
        calls.length = 0;
        getPublishStatus.mockResolvedValue({
            publishedVersion: 1,
            unpublishedChanges: true,
            autoPublish: false,
        });
        publish.mockImplementation(async () => {
            calls.push('publish');
            return { version: 2 };
        });
    });

    it('lets the autosaver send its edits first, then saves and publishes', async () => {
        registerFlushNow(async () => {
            calls.push('autosaver');
        });
        try {
            show();
            fireEvent.click(
                await screen.findByRole('button', { name: /^Publish\./ })
            );
            const submit = (
                await screen.findAllByRole('button', { name: 'Publish' })
            ).find((b) => b.getAttribute('type') === 'submit')!;
            fireEvent.click(submit);
            await waitFor(() => expect(calls).toContain('publish'));
            expect(calls).toEqual(['autosaver', 'sync', 'publish']);
        } finally {
            registerFlushNow(null);
        }
    });
});

describe('PublishControl saving the auto-publish setting', () => {
    beforeEach(() => {
        localStorage.clear();
        getPublishStatus.mockReset().mockResolvedValue({
            publishedVersion: 1,
            unpublishedChanges: false,
            autoPublish: false,
        });
        publish.mockReset().mockResolvedValue({ version: 2 });
        syncDiagram.mockClear();
        updateDiagram
            .mockReset()
            .mockResolvedValue({ updatedAt: '2026-02-02T00:00:00.000Z' });
    });

    const toggle = async () => {
        fireEvent.click(
            await screen.findByRole('button', { name: /^Publish\./ })
        );
        fireEvent.click(await screen.findByRole('checkbox'));
    };

    it('names its editor, so the server does not answer 423, and adopts the new base time', async () => {
        show();
        await toggle();
        await waitFor(() => expect(updateDiagram).toHaveBeenCalled());
        expect(updateDiagram).toHaveBeenCalledWith('r1', {
            autoPublish: true,
            editorId: 'tab-1',
        });
        await waitFor(() =>
            expect(getBaseUpdatedAt('local-1')).toBe('2026-02-02T00:00:00.000Z')
        );
    });
});

describe('PublishControl for people who cannot edit', () => {
    it.each([
        ['a viewer', { status: 'viewer', projectId: 'p1', remoteId: 'r1' }],
        [
            'an editor who lost the lock',
            {
                status: 'taken',
                projectId: 'p1',
                remoteId: 'r1',
                holder: 'sam@b.c',
            },
        ],
    ] as const)('shows nothing for %s', (_who, access) => {
        const view = render(
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
                        access: access as never,
                        refresh: () => undefined,
                    }}
                >
                    <PublishControl />
                </DiagramAccessContext.Provider>
            </qubdiContext.Provider>
        );
        expect(view.container.textContent).toBe('');
    });

    it('shows "unpublished changes" after a save without a click on Publish', async () => {
        resetSaveStatus();
        getPublishStatus.mockResolvedValue({
            publishedVersion: 1,
            unpublishedChanges: false,
        });
        show();
        await screen.findByRole('button', { name: /Published v1$/ });
        getPublishStatus.mockResolvedValue({
            publishedVersion: 1,
            unpublishedChanges: true,
        });
        act(() => setSaveStatus('saved'));
        await screen.findByRole('button', {
            name: /Published v1, unpublished changes/,
        });
    });
});
