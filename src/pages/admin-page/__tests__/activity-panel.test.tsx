import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem, ActivityParams } from '@/lib/qubdi/api';
import { endOfDay, startOfDay } from '@/lib/qubdi/activity';
import { ActivityPanel } from '../activity-panel';

const adminListActivity = vi.fn();
const adminListUsers = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListActivity: (...a: unknown[]) => adminListActivity(...a),
        adminListUsers: (...a: unknown[]) => adminListUsers(...a),
    },
}));

// Radix Select and Popover expect pointer and scroll APIs that happy-dom lacks
beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

/** Today at noon, so the day heading says "Today" in any time zone. */
const todayNoon = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
};

const entry = (id: number, over: Partial<ActivityItem> = {}): ActivityItem => ({
    id,
    at: todayNoon(),
    action: 'diagram.publish',
    userId: 'u-anna',
    userEmail: 'anna@corp.io',
    diagramId: 'd-orders',
    diagramTitle: 'Orders',
    projectId: null,
    projectName: null,
    targetUserId: null,
    targetUserEmail: null,
    meta: { version: id },
    ...over,
});

const page = (items: ActivityItem[], nextCursor: string | null = null) => ({
    items,
    nextCursor,
});

const lastCall = (): ActivityParams =>
    adminListActivity.mock.calls.at(-1)![0] as ActivityParams;

const pick = async (name: string, option: string) => {
    fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: ' ' });
    fireEvent.keyDown(await screen.findByRole('option', { name: option }), {
        key: 'Enter',
    });
};

describe('ActivityPanel', () => {
    beforeEach(() => {
        adminListActivity.mockReset();
        adminListUsers.mockReset();
        adminListActivity.mockResolvedValue(
            page([
                entry(3),
                entry(2, {
                    action: 'share.create',
                    meta: { access: 'anyone' },
                }),
            ])
        );
        adminListUsers.mockResolvedValue({
            items: [
                {
                    id: 'u-bob',
                    email: 'bob@corp.io',
                    isAdmin: false,
                    isActive: true,
                    createdAt: '2025-01-01T00:00:00.000Z',
                    projects: 0,
                },
            ],
            total: 1,
            page: 1,
            limit: 20,
        });
    });

    it('lists what happened as sentences, under a heading for the day', async () => {
        render(<ActivityPanel />);
        expect(await screen.findByText(/published/)).toBeTruthy();
        expect(
            screen.getByText(/created a share link for/).closest('li')
                ?.textContent
        ).toContain('created a share link for Orders (anyone with the link)');
        const today = screen.getByRole('region', { name: 'Today' });
        expect(within(today).getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText('2 shown, that is everything')).toBeTruthy();
    });

    it('asks for the first page without a cursor, with saves left out', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);
        expect(adminListActivity).toHaveBeenCalledTimes(1);
        expect(lastCall()).toEqual({
            limit: 30,
            cursor: null,
            group: undefined,
            userId: undefined,
            diagramId: undefined,
            from: undefined,
            to: undefined,
            saves: 'hide',
        });
    });

    it('loads more, below the rows already shown, until nothing is left', async () => {
        adminListActivity.mockImplementation(async (p: ActivityParams) =>
            p.cursor
                ? page([entry(1, { diagramTitle: 'Invoices' })])
                : page([entry(3), entry(2)], 'next-page')
        );
        render(<ActivityPanel />);
        await screen.findByText('2 shown');

        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

        await screen.findByText('3 shown, that is everything');
        expect(lastCall().cursor).toBe('next-page');
        expect(screen.getByText('Invoices')).toBeTruthy();
        expect(screen.getAllByText('Orders')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('does not offer more when the server says there is no more', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);
        expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('includes every save when asked', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);

        fireEvent.click(screen.getByLabelText('Show every save'));

        await waitFor(() => expect(lastCall().saves).toBe('show'));
    });

    it('narrows to a kind of activity and starts again from the first page', async () => {
        adminListActivity.mockImplementation(async (p: ActivityParams) =>
            p.group === 'sharing'
                ? page([entry(9, { action: 'share.revoke', meta: null })])
                : page([entry(3), entry(2)], 'next-page')
        );
        render(<ActivityPanel />);
        await screen.findByText('2 shown');

        await pick('Kind of activity', 'Share links');

        await screen.findByText(/revoked a share link/);
        expect(lastCall()).toMatchObject({ group: 'sharing', cursor: null });
        expect(screen.queryByText(/published/)).toBeNull();
    });

    it('narrows to one person when their name is chosen, and back again', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);

        fireEvent.click(
            screen.getAllByRole('button', { name: /anna@corp.io/ })[0]
        );

        await waitFor(() => expect(lastCall().userId).toBe('u-anna'));
        // already narrowed to them: the name is no longer a button
        expect(
            screen.queryByRole('button', { name: /^Show only what/ })
        ).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Choose who did it' })
                .textContent
        ).toContain('anna@corp.io');

        fireEvent.click(
            screen.getByRole('button', { name: "Show everyone's activity" })
        );
        await waitFor(() => expect(lastCall().userId).toBeUndefined());
    });

    it('narrows to one diagram when its title is chosen, and shows which', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);

        fireEvent.click(screen.getAllByRole('button', { name: 'Orders' })[0]);

        await waitFor(() => expect(lastCall().diagramId).toBe('d-orders'));
        expect(screen.getByText('Diagram: Orders')).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', { name: 'Show every diagram' })
        );
        await waitFor(() => expect(lastCall().diagramId).toBeUndefined());
        expect(screen.queryByText('Diagram: Orders')).toBeNull();
    });

    it('finds a person to narrow to by searching users', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);

        fireEvent.click(
            screen.getByRole('button', { name: 'Choose who did it' })
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'bob@corp.io' })
        );

        await waitFor(() => expect(lastCall().userId).toBe('u-bob'));
        expect(
            screen.getByRole('button', { name: 'Choose who did it' })
                .textContent
        ).toContain('bob@corp.io');
    });

    it('turns a date range into the first and last instant of those days', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);

        fireEvent.change(screen.getByLabelText('From'), {
            target: { value: '2026-10-01' },
        });
        await waitFor(() =>
            expect(lastCall().from).toBe(startOfDay('2026-10-01'))
        );

        fireEvent.change(screen.getByLabelText('To'), {
            target: { value: '2026-10-05' },
        });
        await waitFor(() => expect(lastCall().to).toBe(endOfDay('2026-10-05')));
        expect(lastCall().from).toBe(startOfDay('2026-10-01'));
    });

    it('clears every filter at once', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);
        await pick('Kind of activity', 'Diagrams');
        fireEvent.change(screen.getByLabelText('From'), {
            target: { value: '2026-10-01' },
        });
        await waitFor(() => expect(lastCall().from).toBeDefined());

        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

        await waitFor(() =>
            expect(lastCall()).toMatchObject({
                group: undefined,
                from: undefined,
                to: undefined,
            })
        );
        expect(
            screen.queryByRole('button', { name: 'Clear filters' })
        ).toBeNull();
    });

    it('asks again when Refresh is pressed', async () => {
        render(<ActivityPanel />);
        await screen.findByText(/published/);
        expect(adminListActivity).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

        await waitFor(() => expect(adminListActivity).toHaveBeenCalledTimes(2));
        expect(lastCall().cursor).toBeNull();
    });

    it('names what is gone, without making it a button', async () => {
        adminListActivity.mockResolvedValue(
            page([
                entry(1, {
                    userEmail: null,
                    diagramTitle: null,
                    diagramId: 'd-gone',
                }),
            ])
        );
        render(<ActivityPanel />);
        expect(await screen.findByText('A deleted user')).toBeTruthy();
        expect(screen.getByText('a deleted diagram')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /deleted/ })).toBeNull();
    });

    describe('when there is nothing to show', () => {
        beforeEach(() => adminListActivity.mockResolvedValue(page([])));

        it('says nothing has happened, and where saves went', async () => {
            render(<ActivityPanel />);
            expect(
                await screen.findByText(/Nothing has happened yet\./)
            ).toBeTruthy();
            expect(screen.getByText(/Saves are hidden/)).toBeTruthy();
        });

        it('says the filters match nothing', async () => {
            render(<ActivityPanel />);
            await screen.findByText(/Nothing has happened yet\./);
            await pick('Kind of activity', 'Comments');
            expect(
                await screen.findByText(/Nothing matches these filters\./)
            ).toBeTruthy();
        });

        it('stops mentioning saves once they are shown', async () => {
            render(<ActivityPanel />);
            await screen.findByText(/Saves are hidden/);
            fireEvent.click(screen.getByLabelText('Show every save'));
            await waitFor(() =>
                expect(screen.queryByText(/Saves are hidden/)).toBeNull()
            );
        });
    });

    it('shows the reason when the list cannot be loaded', async () => {
        adminListActivity.mockRejectedValue(new TypeError('network'));
        render(<ActivityPanel />);
        expect((await screen.findByRole('alert')).textContent).toMatch(
            /reach/i
        );
    });
});
