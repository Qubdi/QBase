import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    type AdminDiagram,
    type AdminShareLink,
} from '@/lib/qubdi/api';
import { DiagramLinksDialog } from '../diagram-links-dialog';

const adminListDiagramLinks = vi.fn();
const adminRevokeDiagramLink = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListDiagramLinks: (...a: unknown[]) => adminListDiagramLinks(...a),
        adminRevokeDiagramLink: (...a: unknown[]) =>
            adminRevokeDiagramLink(...a),
    },
}));

const toast = vi.fn();
vi.mock('@/platform/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

const diagram = (over: Partial<AdminDiagram> = {}): AdminDiagram => ({
    id: 'd1',
    title: 'Invoices',
    projectId: 'p1',
    projectName: 'Billing',
    projectSlug: 'Billing',
    ownerId: 'u1',
    ownerEmail: 'anna@corp.io',
    updatedAt: ago(HOUR),
    publishedVersion: 2,
    editingBy: null,
    activeLinks: 1,
    ...over,
});

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

const renderDialog = (
    props: Partial<React.ComponentProps<typeof DiagramLinksDialog>> = {}
) => {
    const onClose = vi.fn();
    const onChanged = vi.fn();
    const view = render(
        <DiagramLinksDialog
            diagram={diagram()}
            onClose={onClose}
            onChanged={onChanged}
            {...props}
        />
    );
    return { onClose, onChanged, ...view };
};

const rowOf = (text: string | RegExp) =>
    screen.getByText(text).closest('li') as HTMLElement;

describe('DiagramLinksDialog', () => {
    beforeEach(() => {
        adminListDiagramLinks.mockReset();
        adminRevokeDiagramLink.mockReset();
        toast.mockReset();
        adminListDiagramLinks.mockResolvedValue([link()]);
        adminRevokeDiagramLink.mockResolvedValue(undefined);
    });

    it('says whose links these are, and why the address is not here', async () => {
        renderDialog();
        expect(await screen.findByText(/Invoices\./)).toBeTruthy();
        expect(screen.getByText(/shown once/)).toBeTruthy();
        expect(adminListDiagramLinks).toHaveBeenCalledWith('d1');
    });

    it('shows who can open a link, who made it, and when it ends', async () => {
        adminListDiagramLinks.mockResolvedValue([
            // an hour over, because "in 3 days" counts the whole days still to go
            link({ expiresAt: later(3 * 24 * HOUR + HOUR) }),
        ]);
        renderDialog();
        await screen.findByText('Anyone with the link');
        const item = rowOf('Anyone with the link');
        expect(item.textContent).toContain('Active');
        expect(item.textContent).toContain('Made by anna@corp.io 2 hours ago');
        expect(item.textContent).toContain('Expires in 3 days');
    });

    it('marks a link that sends viewers every new version as live', async () => {
        adminListDiagramLinks.mockResolvedValue([link({ live: true })]);
        renderDialog();
        await screen.findByText('Anyone with the link');
        expect(
            within(rowOf('Anyone with the link')).getByText('Live')
        ).toBeTruthy();
    });

    it('lists links in every state, each with its own wording', async () => {
        adminListDiagramLinks.mockResolvedValue([
            link({ id: 'a', access: 'signed_in', status: 'active' }),
            link({ id: 'b', access: 'off', status: 'off' }),
            link({
                id: 'c',
                status: 'expired',
                expiresAt: ago(2 * 24 * HOUR),
            }),
            link({ id: 'd', status: 'revoked', revokedAt: ago(3 * HOUR) }),
        ]);
        renderDialog();
        await screen.findByText('Signed-in users only');
        const items = within(
            screen.getByRole('list', { name: 'Share links' })
        ).getAllByRole('listitem');
        expect(items).toHaveLength(4);
        expect(items[0].textContent).toContain('Active');
        expect(items[1].textContent).toContain('Switched off');
        expect(items[2].textContent).toContain('Expired 2 days ago');
        expect(items[3].textContent).toContain('Revoked 3 hours ago');
    });

    it('offers to revoke anything that is not already revoked', async () => {
        adminListDiagramLinks.mockResolvedValue([
            link({ id: 'a', status: 'active' }),
            link({ id: 'b', status: 'off', access: 'off' }),
            link({ id: 'c', status: 'expired', expiresAt: ago(HOUR) }),
            link({ id: 'd', status: 'revoked', revokedAt: ago(HOUR) }),
        ]);
        renderDialog();
        await screen.findByText('Switched off');
        expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(
            3
        );
    });

    it('names a maker who has been deleted', async () => {
        adminListDiagramLinks.mockResolvedValue([
            link({ createdById: null, createdByEmail: null }),
        ]);
        renderDialog();
        expect(await screen.findByText(/Made by a deleted user/)).toBeTruthy();
    });

    it('says so when there are none', async () => {
        adminListDiagramLinks.mockResolvedValue([]);
        renderDialog();
        expect(
            await screen.findByText('This diagram has no share links.')
        ).toBeTruthy();
    });

    it('waits for the list', async () => {
        adminListDiagramLinks.mockReturnValue(new Promise(() => undefined));
        renderDialog();
        expect(await screen.findByText('Loading…')).toBeTruthy();
    });

    it('shows why the links could not be loaded', async () => {
        adminListDiagramLinks.mockRejectedValue(new ApiError(404, 'not_found'));
        renderDialog();
        expect((await screen.findByRole('alert')).textContent).toBe(
            'Not found.'
        );
        expect(screen.queryByText('Loading…')).toBeNull();
    });

    describe('revoking', () => {
        it('asks a second time first, and says what it will do', async () => {
            renderDialog();
            await screen.findByText('Anyone with the link');

            fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

            expect(
                screen.getByRole('button', { name: 'Yes, revoke' })
            ).toBeTruthy();
            expect(
                screen.getByText(/including people watching it live/)
            ).toBeTruthy();
            expect(screen.getByText(/cannot be undone/)).toBeTruthy();
            expect(adminRevokeDiagramLink).not.toHaveBeenCalled();
        });

        it('sends nothing when the admin keeps it', async () => {
            renderDialog();
            await screen.findByText('Anyone with the link');
            fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

            fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

            expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
            expect(
                screen.queryByRole('button', { name: 'Yes, revoke' })
            ).toBeNull();
            expect(adminRevokeDiagramLink).not.toHaveBeenCalled();
        });

        it('ends that link, shows it as revoked, tells the page behind and says so', async () => {
            adminListDiagramLinks
                .mockResolvedValueOnce([
                    link({ id: 'l1' }),
                    link({ id: 'l2', access: 'signed_in' }),
                ])
                .mockResolvedValueOnce([
                    link({ id: 'l1', status: 'revoked', revokedAt: ago(1000) }),
                    link({ id: 'l2', access: 'signed_in' }),
                ]);
            const { onChanged } = renderDialog();
            await screen.findByText('Signed-in users only');
            fireEvent.click(
                within(rowOf('Anyone with the link')).getByRole('button', {
                    name: 'Revoke',
                })
            );

            fireEvent.click(
                screen.getByRole('button', { name: 'Yes, revoke' })
            );

            await waitFor(() =>
                expect(adminRevokeDiagramLink).toHaveBeenCalledWith('d1', 'l1')
            );
            await waitFor(() =>
                expect(rowOf('Anyone with the link').textContent).toContain(
                    'Revoked'
                )
            );
            // the other link is untouched and still revocable
            expect(
                within(rowOf('Signed-in users only')).getByRole('button', {
                    name: 'Revoke',
                })
            ).toBeTruthy();
            expect(onChanged).toHaveBeenCalledTimes(1);
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Link revoked' })
            );
        });

        it('keeps the link, and shows why, when the server refuses', async () => {
            adminRevokeDiagramLink.mockRejectedValue(
                new ApiError(404, 'not_found')
            );
            const { onChanged } = renderDialog();
            await screen.findByText('Anyone with the link');
            fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

            fireEvent.click(
                screen.getByRole('button', { name: 'Yes, revoke' })
            );

            expect((await screen.findByRole('alert')).textContent).toBe(
                'Not found.'
            );
            expect(onChanged).not.toHaveBeenCalled();
            expect(toast).not.toHaveBeenCalled();
            expect(adminListDiagramLinks).toHaveBeenCalledTimes(1);
        });

        it('cannot be started twice at once', async () => {
            let finish!: () => void;
            adminRevokeDiagramLink.mockReturnValue(
                new Promise<void>((resolve) => {
                    finish = resolve;
                })
            );
            renderDialog();
            await screen.findByText('Anyone with the link');
            fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
            fireEvent.click(
                screen.getByRole('button', { name: 'Yes, revoke' })
            );

            await waitFor(() =>
                expect(
                    (
                        screen.getByRole('button', {
                            name: 'Yes, revoke',
                        }) as HTMLButtonElement
                    ).disabled
                ).toBe(true)
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Yes, revoke' })
            );
            finish();
            await waitFor(() =>
                expect(adminRevokeDiagramLink).toHaveBeenCalledTimes(1)
            );
        });
    });

    it("asks for another diagram's links when another is chosen, and drops the old ones", async () => {
        adminListDiagramLinks.mockImplementation(async (id: string) =>
            id === 'd1'
                ? [link({ access: 'anyone' })]
                : [link({ id: 'x', access: 'signed_in' })]
        );
        const { rerender, onClose, onChanged } = renderDialog();
        await screen.findByText('Anyone with the link');

        rerender(
            <DiagramLinksDialog
                diagram={diagram({ id: 'd2', title: 'Orders' })}
                onClose={onClose}
                onChanged={onChanged}
            />
        );

        expect(await screen.findByText('Signed-in users only')).toBeTruthy();
        expect(screen.queryByText('Anyone with the link')).toBeNull();
        expect(adminListDiagramLinks).toHaveBeenLastCalledWith('d2');
    });

    it('forgets a half-made revoke when another diagram is chosen', async () => {
        adminListDiagramLinks.mockResolvedValue([link()]);
        const { rerender, onClose, onChanged } = renderDialog();
        await screen.findByText('Anyone with the link');
        fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

        rerender(
            <DiagramLinksDialog
                diagram={diagram({ id: 'd2' })}
                onClose={onClose}
                onChanged={onChanged}
            />
        );

        await screen.findByRole('button', { name: 'Revoke' });
        expect(
            screen.queryByRole('button', { name: 'Yes, revoke' })
        ).toBeNull();
    });

    it('asks for nothing while no diagram is chosen', () => {
        renderDialog({ diagram: null });
        expect(adminListDiagramLinks).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
