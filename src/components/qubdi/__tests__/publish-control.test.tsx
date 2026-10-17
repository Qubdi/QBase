import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { PublishControl } from '../publish-control';

const getDiagram = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { getDiagram: (...a: unknown[]) => getDiagram(...a) },
}));

vi.mock('@/hooks/use-diagram', () => ({
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
                    syncDiagram: vi.fn(),
                } as unknown as QubdiContext
            }
        >
            <PublishControl />
        </qubdiContext.Provider>
    );

describe('PublishControl status', () => {
    beforeEach(() => {
        getDiagram.mockReset();
    });

    it('is a badge inside the Publish button, with the full sentence on hover', async () => {
        getDiagram.mockResolvedValue({
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
        getDiagram.mockResolvedValue({
            publishedVersion: 3,
            unpublishedChanges: false,
            autoPublish: false,
        });
        show();
        expect((await screen.findByText('v3')).closest('button')).toBeTruthy();
    });

    it('is a bare dot, with the words in the name, until it has heard from the server', () => {
        getDiagram.mockReturnValue(new Promise(() => undefined));
        show();
        expect(screen.getByTestId('publish-status').textContent).toBe('');
        expect(
            screen.getByRole('button', {
                name: 'Publish. Not synced to server',
            })
        ).toBeTruthy();
    });

    it('is a bare dot before the first publish', async () => {
        getDiagram.mockResolvedValue({
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
