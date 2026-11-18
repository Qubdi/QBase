import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { AccessState } from '@/lib/qubdi/access';
import { AccessBanner } from '../access-banner';
import { DiagramAccessContext } from '../diagram-access-context';

const api = vi.hoisted(() => ({
    listProjects: vi.fn(),
    getProject: vi.fn(async () => ({ name: 'Billing' })),
}));
vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: 'd1', name: 'Shop' } }),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));
// the banner of a diagram someone else is editing can load the latest version
vi.mock('@/qbase/use-storage', () => ({
    useStorage: () => ({ deleteDiagram: vi.fn() }),
}));

beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});
beforeEach(() => vi.clearAllMocks());

const show = async (
    access: AccessState,
    syncDiagram = vi.fn(async () => 'r1'),
    refresh = vi.fn()
) => {
    await act(async () => {
        render(
            <qubdiContext.Provider
                value={
                    {
                        user: { email: 'me@corp.io' },
                        syncDiagram,
                    } as unknown as QubdiContext
                }
            >
                <DiagramAccessContext.Provider value={{ access, refresh }}>
                    <AccessBanner />
                </DiagramAccessContext.Provider>
            </qubdiContext.Provider>
        );
    });
    return { syncDiagram, refresh };
};

describe('the read-only banner (SHL-112)', () => {
    it('is silent for an editor and in local mode', async () => {
        await show({ status: 'editor', projectId: 'p', remoteId: 'r' });
        expect(screen.queryByRole('status')).toBeNull();
    });

    it.each<[AccessState, RegExp]>([
        [{ status: 'viewer', projectId: 'p', remoteId: 'r' }, /./],
        [{ status: 'unbound' }, /./],
        [{ status: 'lost', remoteId: 'r' } as AccessState, /./],
        [{ status: 'error' }, /./],
        [{ status: 'taken', projectId: 'p', remoteId: 'r', holder: null }, /./],
    ])('%j explains itself in the banner', async (access, text) => {
        api.listProjects.mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            limit: 100,
        });
        await show(access);
        const banner = screen.getByRole('status');
        expect(banner.textContent).toMatch(text);
        expect((banner.textContent ?? '').trim().length).toBeGreaterThan(10);
    });

    it('unbound with no project to move into points to an admin', async () => {
        api.listProjects.mockResolvedValue({
            items: [],
            total: 0,
            page: 1,
            limit: 100,
        });
        await show({ status: 'unbound' });
        expect(
            await screen.findByText('Ask an admin to add you to a project.')
        ).toBeTruthy();
    });

    it('unbound lists only the projects the user may edit, and Move puts the diagram into the chosen one', async () => {
        api.listProjects.mockResolvedValue({
            items: [
                { id: 'p1', name: 'Billing', slug: 'billing', role: 'owner' },
                { id: 'p2', name: 'Docs', slug: 'docs', role: 'viewer' },
                { id: 'p3', name: 'Ops', slug: 'ops', role: 'editor' },
            ],
            total: 3,
            page: 1,
            limit: 100,
        });
        const { syncDiagram, refresh } = await show({ status: 'unbound' });
        const picker = await screen.findByRole('combobox', {
            name: 'Project to move this diagram into',
        });
        const move = screen.getByRole('button', {
            name: 'Move into project',
        }) as HTMLButtonElement;
        expect(move.disabled).toBe(true);
        fireEvent.keyDown(picker, { key: ' ' });
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).toEqual(['Billing', 'Ops']);
        fireEvent.click(screen.getByRole('option', { name: 'Ops' }));
        await waitFor(() => expect(move.disabled).toBe(false));
        fireEvent.click(move);
        await waitFor(() =>
            expect(syncDiagram).toHaveBeenCalledWith(
                { id: 'd1', name: 'Shop' },
                'p3'
            )
        );
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it('an unreachable server offers Try again', async () => {
        const { refresh } = await show({ status: 'error' });
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refresh).toHaveBeenCalled();
    });
});
