import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDiagram, AdminShareLink } from '@/lib/qubdi/api';
import { DiagramLinksDialog } from '@/pages/admin-page/diagram-links-dialog';
import { ShareDialog } from '../share-dialog';

const adminListDiagramLinks = vi.fn();
const listShareLinks = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListDiagramLinks: (...a: unknown[]) => adminListDiagramLinks(...a),
        listShareLinks: (...a: unknown[]) => listShareLinks(...a),
    },
}));
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const link = (over: Partial<AdminShareLink> = {}): AdminShareLink => ({
    id: 'l1',
    access: 'anyone',
    live: false,
    expiresAt: null,
    createdAt: ago(2 * HOUR),
    revokedAt: null,
    createdById: 'u1',
    createdByEmail: 'anna@corp.io',
    status: 'active',
    ...over,
});

// one link in every state, with and without "live"
const LINKS = [
    link({ id: 'a', access: 'signed_in', live: true }),
    link({ id: 'b', access: 'off', status: 'off' }),
    link({ id: 'c', status: 'expired', expiresAt: ago(48 * HOUR) }),
    link({ id: 'd', status: 'revoked', revokedAt: ago(3 * HOUR) }),
];

// the editor's list does not carry the maker or the status
const forEditor = (l: AdminShareLink) => ({
    id: l.id,
    diagramId: 'd1',
    access: l.access,
    expiresAt: l.expiresAt,
    live: l.live,
    createdAt: l.createdAt,
    revokedAt: l.revokedAt,
});

/** What of each row is the shared table: everything but the maker and the editor-only controls. */
const tableOf = (list: HTMLElement) => ({
    list: list.className,
    // where it sits in the dialog: after the header, with nothing but an error above it
    position: [...(list.parentElement?.children ?? [])]
        .slice(0, [...(list.parentElement?.children ?? [])].indexOf(list))
        .map((el) => el.tagName),
    rows: within(list)
        .getAllByRole('listitem')
        .map((li) => {
            const part = (slot: string) =>
                li.querySelector(`[data-slot="${slot}"]`)?.outerHTML ?? null;
            return {
                className: li.className,
                summary: part('summary'),
                expiry: part('expiry'),
                revoke: part('revoke'),
            };
        }),
});

describe('the share-link table', () => {
    beforeEach(() => {
        adminListDiagramLinks.mockResolvedValue(LINKS);
        listShareLinks.mockResolvedValue(LINKS.map(forEditor));
    });
    afterEach(cleanup);

    it('is the same in the admin dialog and the editor dialog', async () => {
        const admin = render(
            <DiagramLinksDialog
                diagram={{ id: 'd1', title: 'Invoices' } as AdminDiagram}
                onClose={vi.fn()}
                onChanged={vi.fn()}
            />
        );
        await screen.findByText('Signed-in users only');
        const adminTable = tableOf(screen.getByRole('list'));
        admin.unmount();

        render(
            <ShareDialog
                open
                onOpenChange={vi.fn()}
                ensureRemoteId={() => Promise.resolve('d1')}
            />
        );
        await screen.findByText('Signed-in users only');
        const editorTable = tableOf(
            screen.getByRole('list', { name: 'Share links' })
        );

        expect(adminTable.rows).toHaveLength(4);
        // the editor leaves revoked links out; the admin keeps them as history
        expect(editorTable).toEqual({
            ...adminTable,
            rows: adminTable.rows.slice(0, 3),
        });
        // and it is the states we meant to compare
        expect(adminTable.rows.map((r) => r.revoke !== null)).toEqual([
            true,
            true,
            true,
            false,
        ]);
        expect(editorTable.rows.every((r) => r.revoke !== null)).toBe(true);
    });

    it('does not claim the editor knows who made a link', async () => {
        render(
            <ShareDialog
                open
                onOpenChange={vi.fn()}
                ensureRemoteId={() => Promise.resolve('d1')}
            />
        );
        await screen.findByText('Signed-in users only');
        expect(screen.queryByText(/deleted user/)).toBeNull();
    });
});
