import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { AccessState } from '@/lib/qubdi/access';
import { AccessBanner } from '../access-banner';
import { DiagramAccessContext } from '../diagram-access-context';

vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { name: 'Shop' } }),
}));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { listProjects: async () => ({ items: [] }) },
}));
vi.mock('../get-latest-control', () => ({
    GetLatestDialog: ({ open }: { open: boolean }) =>
        open ? <div>latest dialog</div> : null,
}));

// the banner looks up the project list when it mounts: let that settle
const show = (access: AccessState, email = 'me@corp.io') =>
    act(async () => {
        render(
            <qubdiContext.Provider
                value={{ user: { email } } as unknown as QubdiContext}
            >
                <DiagramAccessContext.Provider
                    value={{ access, refresh: () => undefined }}
                >
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
