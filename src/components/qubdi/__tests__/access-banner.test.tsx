import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { AccessState } from '@/lib/qubdi/access';
import { AccessBanner } from '../access-banner';
import { DiagramAccessContext } from '../diagram-access-context';

const getProject = vi.fn(async (id: unknown) => {
    void id;
    return { name: 'Billing' };
});

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { name: 'Shop' } }),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listProjects: async () => ({ items: [] }),
        getProject: (id: unknown) => getProject(id),
    },
}));
vi.mock('../get-latest-control', () => ({
    GetLatestDialog: ({ open }: { open: boolean }) =>
        open ? <div>latest dialog</div> : null,
}));

// the banner looks up the project list when it mounts: let that settle
const show = (
    access: AccessState,
    email = 'me@corp.io',
    refresh: () => void = () => undefined
) =>
    act(async () => {
        render(
            <qubdiContext.Provider
                value={{ user: { email } } as unknown as QubdiContext}
            >
                <DiagramAccessContext.Provider value={{ access, refresh }}>
                    <AccessBanner />
                </DiagramAccessContext.Provider>
            </qubdiContext.Provider>
        );
    });

const taken = (holder: string | null): AccessState => ({
    status: 'taken',
    projectId: 'p',
    remoteId: 'r',
    holder,
});

describe('AccessBanner when someone else is editing', () => {
    it('says who is editing', async () => {
        await show(taken('sam@corp.io'));
        expect(screen.getByRole('status').textContent).toContain(
            'sam@corp.io is editing this diagram'
        );
    });

    it("recognises the user's own other tab", async () => {
        await show(taken('me@corp.io'));
        expect(screen.getByRole('status').textContent).toContain(
            'another tab or window'
        );
    });

    it('offers to get the latest version and edit, asking first', async () => {
        await show(taken('sam@corp.io'));
        expect(screen.queryByText('latest dialog')).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Get latest and edit' })
        );
        expect(screen.getByText('latest dialog')).toBeTruthy();
    });

    it('has no such button when the reason is a role or a missing project', async () => {
        await show({ status: 'viewer', projectId: 'p', remoteId: 'r' });
        expect(
            screen.queryByRole('button', { name: 'Get latest and edit' })
        ).toBeNull();
    });

    it('stays away from an editor who holds the lock', async () => {
        await show({ status: 'editor', projectId: 'p', remoteId: 'r' });
        expect(screen.queryByRole('status')).toBeNull();
    });
});

describe('AccessBanner when the server could not be reached', () => {
    it('offers Try again, which asks the server again', async () => {
        const refresh = vi.fn();
        await show({ status: 'error' }, 'me@corp.io', refresh);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('has no Try again for the other reasons', async () => {
        await show({ status: 'viewer', projectId: 'p', remoteId: 'r' });
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });
});

describe('AccessBanner naming the project', () => {
    beforeEach(() => getProject.mockClear());

    it("asks for the diagram's own project by id, however many projects there are", async () => {
        await show({ status: 'viewer', projectId: 'p-300', remoteId: 'r' });
        expect(getProject).toHaveBeenCalledExactlyOnceWith('p-300');
        expect(screen.getByRole('status').textContent).toContain(
            'view-only access to Billing'
        );
    });

    it('falls back to the plain wording when the project cannot be read', async () => {
        getProject.mockRejectedValueOnce(new Error('offline'));
        await show({ status: 'viewer', projectId: 'p-300', remoteId: 'r' });
        expect(screen.getByRole('status').textContent).toContain(
            'view-only access to this project'
        );
    });

    it('does not look any project up for a diagram that is in none', async () => {
        await show({ status: 'unbound' });
        expect(getProject).not.toHaveBeenCalled();
    });
});
