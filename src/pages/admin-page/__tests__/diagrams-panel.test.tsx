import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDiagram, AdminProject } from '@/lib/qubdi/api';
import { DiagramsPanel } from '../diagrams-panel';

const adminListDiagrams = vi.fn();
const adminListProjects = vi.fn();
const adminListDiagramLinks = vi.fn();
const adminRevokeDiagramLink = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListDiagrams: (...a: unknown[]) => adminListDiagrams(...a),
        adminListProjects: (...a: unknown[]) => adminListProjects(...a),
        adminListDiagramLinks: (...a: unknown[]) => adminListDiagramLinks(...a),
        adminRevokeDiagramLink: (...a: unknown[]) =>
            adminRevokeDiagramLink(...a),
    },
}));
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

// Radix Popover expects pointer and scroll APIs that happy-dom lacks
beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const diagram = (
    over: Partial<AdminDiagram> & Pick<AdminDiagram, 'id' | 'title'>
): AdminDiagram => ({
    projectId: 'p1',
    projectName: 'Billing',
    projectSlug: 'Billing',
    ownerId: 'u1',
    ownerEmail: 'anna@corp.io',
    updatedAt: ago(3 * HOUR),
    publishedVersion: null,
    editingBy: null,
    activeLinks: 0,
    ...over,
});

const project = (id: string, name: string): AdminProject => ({
    id,
    name,
    slug: name,
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    members: 0,
    diagrams: 0,
});

const diagrams = [
    diagram({
        id: 'd1',
        title: 'Invoices',
        publishedVersion: 3,
        activeLinks: 2,
        editingBy: { userId: 'u2', email: 'bob@corp.io' },
    }),
    diagram({
        id: 'd2',
        title: 'Order form',
        projectId: 'p2',
        projectName: 'Orders',
        projectSlug: 'Orders',
        ownerEmail: 'cara@corp.io',
        updatedAt: ago(2 * 24 * HOUR),
    }),
];

const answer = (items: AdminDiagram[], total = items.length, page = 1) => ({
    items,
    total,
    page,
    limit: 10,
});

const renderPanel = async () => {
    render(
        <MemoryRouter>
            <DiagramsPanel />
        </MemoryRouter>
    );
    await screen.findByText('Invoices');
};

const rowFor = (title: string) =>
    screen.getByText(title).closest('tr') as HTMLElement;
const lastCall = () =>
    adminListDiagrams.mock.calls.at(-1)![0] as Record<string, unknown>;

describe('DiagramsPanel', () => {
    beforeEach(() => {
        adminListDiagrams.mockReset();
        adminListProjects.mockReset();
        adminListDiagramLinks.mockReset();
        adminRevokeDiagramLink.mockReset();
        adminListDiagrams.mockResolvedValue(answer(diagrams));
        adminListProjects.mockResolvedValue({
            items: [project('p1', 'Billing'), project('p2', 'Orders')],
            total: 2,
            page: 1,
            limit: 20,
        });
        adminListDiagramLinks.mockResolvedValue([]);
    });

    it('asks for the first page, ten at a time, with no filter', async () => {
        await renderPanel();
        expect(adminListDiagrams).toHaveBeenCalledTimes(1);
        expect(lastCall()).toEqual({
            page: 1,
            limit: 10,
            q: '',
            projectId: undefined,
        });
    });

    it('shows each diagram with its project, owner and when it changed', async () => {
        await renderPanel();
        const row = within(rowFor('Invoices'));
        expect(row.getByText('Billing')).toBeTruthy();
        expect(row.getByText('anna@corp.io')).toBeTruthy();
        expect(row.getByText('3 hours ago')).toBeTruthy();
        expect(
            within(rowFor('Order form')).getByText('2 days ago')
        ).toBeTruthy();
    });

    it("links the title into the editor, in the diagram's own project", async () => {
        await renderPanel();
        const link = screen.getByRole('link', { name: 'Invoices' });
        expect(link.getAttribute('href')).toBe('/Billing/diagrams/d1');
        expect(
            screen
                .getByRole('link', { name: 'Order form' })
                .getAttribute('href')
        ).toBe('/Orders/diagrams/d2');
    });

    it('shows the newest published version, or that it was never published', async () => {
        await renderPanel();
        expect(within(rowFor('Invoices')).getByText('v3')).toBeTruthy();
        expect(within(rowFor('Order form')).getByText('Never')).toBeTruthy();
    });

    it('shows who is editing now, or no one', async () => {
        await renderPanel();
        expect(
            within(rowFor('Invoices')).getByText('bob@corp.io')
        ).toBeTruthy();
        expect(within(rowFor('Order form')).getByText('No one')).toBeTruthy();
    });

    it('shows how many share links are open, and only offers links where there are some', async () => {
        await renderPanel();
        expect(
            within(rowFor('Invoices')).getByRole('button', {
                name: 'Share links of Invoices: 2 active',
            }).textContent
        ).toBe('2 active');
        expect(within(rowFor('Order form')).getByText('None')).toBeTruthy();
        expect(within(rowFor('Order form')).queryByRole('button')).toBeNull();
    });

    it('says what it does not know, rather than leaving a blank', async () => {
        adminListDiagrams.mockResolvedValue(
            answer([
                diagram({
                    id: 'd9',
                    title: 'Orphan',
                    projectName: null,
                    projectSlug: null,
                    ownerEmail: null,
                    editingBy: { userId: 'gone', email: null },
                }),
            ])
        );
        render(
            <MemoryRouter>
                <DiagramsPanel />
            </MemoryRouter>
        );
        await screen.findByText('Orphan');
        const row = within(rowFor('Orphan'));
        expect(row.getByText('Unknown')).toBeTruthy();
        expect(row.getByText('Deleted user')).toBeTruthy();
        expect(row.getByText('Someone')).toBeTruthy();
        // no project, so no address to open it at
        expect(screen.queryByRole('link', { name: 'Orphan' })).toBeNull();
    });

    describe('search', () => {
        it('asks the server for titles that match, from the first page', async () => {
            await renderPanel();
            fireEvent.change(
                screen.getByRole('searchbox', { name: 'Search diagrams' }),
                { target: { value: 'invo' } }
            );
            await waitFor(() => expect(lastCall().q).toBe('invo'));
            expect(lastCall().page).toBe(1);
        });

        it('says when nothing matches', async () => {
            await renderPanel();
            adminListDiagrams.mockResolvedValue(answer([]));
            fireEvent.change(
                screen.getByRole('searchbox', { name: 'Search diagrams' }),
                { target: { value: 'zzz' } }
            );
            expect(
                await screen.findByText(`No diagram's title matches "zzz".`)
            ).toBeTruthy();
        });
    });

    describe('project filter', () => {
        const openFilter = () =>
            fireEvent.click(
                screen.getByRole('button', { name: 'Choose a project' })
            );

        it('does not ask for projects until it is opened', async () => {
            await renderPanel();
            expect(adminListProjects).not.toHaveBeenCalled();
            openFilter();
            await screen.findByRole('button', { name: 'Orders' });
            expect(adminListProjects).toHaveBeenCalled();
        });

        it('narrows to the project chosen, and shows which', async () => {
            await renderPanel();
            openFilter();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Orders' })
            );

            await waitFor(() => expect(lastCall().projectId).toBe('p2'));
            expect(
                screen.getByRole('button', { name: 'Choose a project' })
                    .textContent
            ).toContain('Orders');
        });

        it('goes back to every project', async () => {
            await renderPanel();
            openFilter();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Orders' })
            );
            await waitFor(() => expect(lastCall().projectId).toBe('p2'));

            fireEvent.click(
                screen.getByRole('button', { name: 'Show every project' })
            );

            await waitFor(() => expect(lastCall().projectId).toBeUndefined());
            expect(
                screen.getByRole('button', { name: 'Choose a project' })
                    .textContent
            ).toContain('All projects');
        });

        it('says which project has no diagrams', async () => {
            await renderPanel();
            adminListDiagrams.mockResolvedValue(answer([]));
            openFilter();
            fireEvent.click(
                await screen.findByRole('button', { name: 'Orders' })
            );
            expect(
                await screen.findByText('Orders has no diagrams.')
            ).toBeTruthy();
        });
    });

    describe('paging', () => {
        it('goes to the next page, keeping the filters', async () => {
            adminListDiagrams.mockResolvedValue(answer(diagrams, 25));
            await renderPanel();
            expect(screen.getByText('1–10 of 25 diagrams')).toBeTruthy();

            fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

            await waitFor(() => expect(lastCall().page).toBe(2));
        });
    });

    describe('share links', () => {
        it('opens the links of the diagram in that row', async () => {
            await renderPanel();
            fireEvent.click(
                within(rowFor('Invoices')).getByRole('button', {
                    name: /Share links of Invoices/,
                })
            );
            expect(
                await screen.findByText('This diagram has no share links.')
            ).toBeTruthy();
            expect(adminListDiagramLinks).toHaveBeenCalledWith('d1');
        });

        it('refreshes the counts after a link is revoked', async () => {
            adminListDiagramLinks.mockResolvedValue([
                {
                    id: 'l1',
                    access: 'anyone',
                    live: false,
                    expiresAt: null,
                    createdAt: ago(HOUR),
                    revokedAt: null,
                    createdById: 'u1',
                    createdByEmail: 'anna@corp.io',
                    status: 'active',
                },
            ]);
            adminRevokeDiagramLink.mockResolvedValue(undefined);
            await renderPanel();
            const before = adminListDiagrams.mock.calls.length;
            fireEvent.click(
                within(rowFor('Invoices')).getByRole('button', {
                    name: /Share links of Invoices/,
                })
            );
            await screen.findByText('Anyone with the link');
            fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
            fireEvent.click(
                screen.getByRole('button', { name: 'Yes, revoke' })
            );

            await waitFor(() =>
                expect(adminListDiagrams.mock.calls.length).toBeGreaterThan(
                    before
                )
            );
        });
    });

    it('explains an empty list', async () => {
        adminListDiagrams.mockResolvedValue(answer([]));
        render(
            <MemoryRouter>
                <DiagramsPanel />
            </MemoryRouter>
        );
        expect(
            await screen.findByText('There are no diagrams yet.')
        ).toBeTruthy();
    });

    it('shows why the list could not be loaded', async () => {
        adminListDiagrams.mockRejectedValue(new TypeError('network'));
        render(
            <MemoryRouter>
                <DiagramsPanel />
            </MemoryRouter>
        );
        expect((await screen.findByRole('alert')).textContent).toMatch(
            /reach/i
        );
    });
});
