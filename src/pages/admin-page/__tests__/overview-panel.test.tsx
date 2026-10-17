import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ActivityItem, type AdminStats } from '@/lib/qubdi/api';
import { OverviewPanel, RECENT_EVENTS } from '../overview-panel';

const adminStats = vi.fn();
const adminListActivity = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminStats: (...a: unknown[]) => adminStats(...a),
        adminListActivity: (...a: unknown[]) => adminListActivity(...a),
    },
}));

const stats = (over: Partial<AdminStats> = {}): AdminStats => ({
    users: { total: 12, active: 10, admins: 2, signedIn: 3 },
    projects: 4,
    diagrams: { total: 1284, published: 900 },
    activeLinks: 7,
    editingNow: 2,
    driftChecks24h: 15,
    activity: {
        timeZone: 'UTC',
        days: [
            { day: '2026-10-10', events: 3 },
            { day: '2026-10-11', events: 0 },
            { day: '2026-10-12', events: 12 },
            { day: '2026-10-13', events: 7 },
            { day: '2026-10-14', events: 0 },
            { day: '2026-10-15', events: 5 },
            { day: '2026-10-16', events: 9 },
        ],
    },
    ...over,
});

const entry = (id: number, over: Partial<ActivityItem> = {}): ActivityItem => ({
    id,
    at: new Date(Date.now() - id * 3_600_000).toISOString(),
    action: 'diagram.publish',
    userId: 'u1',
    userEmail: 'anna@corp.io',
    diagramId: 'd1',
    diagramTitle: 'Orders',
    projectId: null,
    projectName: null,
    targetUserId: null,
    targetUserEmail: null,
    meta: { version: id },
    ...over,
});

const renderPanel = async () => {
    render(
        <MemoryRouter>
            <OverviewPanel />
        </MemoryRouter>
    );
    await screen.findByText('Users');
};

const tile = (label: string) =>
    screen.getByText(label).closest('a, div') as HTMLElement;

describe('OverviewPanel', () => {
    beforeEach(() => {
        adminStats.mockReset();
        adminListActivity.mockReset();
        adminStats.mockResolvedValue(stats());
        adminListActivity.mockResolvedValue({
            items: [
                entry(1),
                entry(2, {
                    action: 'share.create',
                    meta: { access: 'anyone' },
                }),
            ],
            nextCursor: null,
        });
    });

    describe('asking', () => {
        it("asks for the figures in the viewer's time zone", async () => {
            await renderPanel();
            const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            expect(adminStats).toHaveBeenCalledWith(zone);
        });

        it('asks for the latest few events, without saves', async () => {
            await renderPanel();
            expect(adminListActivity).toHaveBeenCalledWith({
                limit: RECENT_EVENTS,
                saves: 'hide',
            });
        });
    });

    describe('the tiles', () => {
        it('show the totals, with what makes them up', async () => {
            await renderPanel();
            const users = within(tile('Users'));
            expect(users.getByText('12')).toBeTruthy();
            expect(users.getByText('10 active')).toBeTruthy();
            expect(users.getByText('2 admins')).toBeTruthy();
            expect(users.getByText('3 signed in now')).toBeTruthy();

            expect(within(tile('Projects')).getByText('4')).toBeTruthy();
            const diagrams = within(tile('Diagrams'));
            expect(diagrams.getByText('1,284')).toBeTruthy();
            expect(diagrams.getByText('900 published')).toBeTruthy();
            expect(
                within(tile('Share links open')).getByText('7')
            ).toBeTruthy();
            expect(
                within(tile('Being edited now')).getByText('2')
            ).toBeTruthy();
            expect(
                within(tile('Drift checks, last 24 hours')).getByText('15')
            ).toBeTruthy();
        });

        it('say "1 admin", not "1 admins"', async () => {
            adminStats.mockResolvedValue(
                stats({
                    users: { total: 1, active: 1, admins: 1, signedIn: 1 },
                })
            );
            await renderPanel();
            expect(within(tile('Users')).getByText('1 admin')).toBeTruthy();
        });

        it('shorten a big number as a tile does', async () => {
            adminStats.mockResolvedValue(
                stats({ diagrams: { total: 12_900, published: 4_200_000 } })
            );
            await renderPanel();
            const diagrams = within(tile('Diagrams'));
            expect(diagrams.getByText('12.9K')).toBeTruthy();
            expect(diagrams.getByText('4.2M published')).toBeTruthy();
        });

        it('lead to the page that has the detail', async () => {
            await renderPanel();
            const href = (label: string) => tile(label).getAttribute('href');
            expect(href('Users')).toBe('/admin/users');
            expect(href('Projects')).toBe('/admin/projects');
            expect(href('Diagrams')).toBe('/admin/diagrams');
            expect(href('Share links open')).toBe('/admin/diagrams');
            expect(href('Being edited now')).toBe('/admin/diagrams');
            expect(href('Drift checks, last 24 hours')).toBe('/admin/activity');
        });

        it('show zero as 0, not as a blank', async () => {
            adminStats.mockResolvedValue(
                stats({ activeLinks: 0, editingNow: 0 })
            );
            await renderPanel();
            expect(
                within(tile('Share links open')).getByText('0')
            ).toBeTruthy();
            expect(
                within(tile('Being edited now')).getByText('0')
            ).toBeTruthy();
        });
    });

    describe('the chart', () => {
        it('shows the week, today last', async () => {
            await renderPanel();
            expect(
                screen.getByRole('region', { name: 'Activity, last 7 days' })
            ).toBeTruthy();
            // today is the last day the server sent
            expect(screen.getByText('Today')).toBeTruthy();
            expect(screen.getByText(/36 events in 7 days/)).toBeTruthy();
        });
    });

    describe('the latest activity', () => {
        it('lists what happened, as sentences, with when', async () => {
            await renderPanel();
            const section = screen.getByRole('region', {
                name: 'Latest activity',
            });
            const items = within(section).getAllByRole('listitem');
            expect(items).toHaveLength(2);
            expect(items[0].textContent).toContain(
                'anna@corp.io published Orders v1'
            );
            expect(items[1].textContent).toContain(
                'created a share link for Orders (anyone with the link)'
            );
            expect(
                within(items[0]).getByText(/\d/, { selector: 'time' })
            ).toBeTruthy();
        });

        it('keeps names plain: there is nothing here to narrow', async () => {
            await renderPanel();
            const section = screen.getByRole('region', {
                name: 'Latest activity',
            });
            expect(
                within(section).queryByRole('button', { name: /anna@corp.io/ })
            ).toBeNull();
        });

        it('leads to the whole list', async () => {
            await renderPanel();
            expect(
                screen
                    .getByRole('link', { name: /See all activity/ })
                    .getAttribute('href')
            ).toBe('/admin/activity');
        });

        it('says so when nothing has happened', async () => {
            adminListActivity.mockResolvedValue({
                items: [],
                nextCursor: null,
            });
            await renderPanel();
            expect(screen.getByText('Nothing has happened yet.')).toBeTruthy();
        });
    });

    describe('when part of it fails', () => {
        it('still shows the latest activity if the figures cannot be loaded', async () => {
            adminStats.mockRejectedValue(new ApiError(500, 'internal_error'));
            render(
                <MemoryRouter>
                    <OverviewPanel />
                </MemoryRouter>
            );
            expect(
                (await screen.findByText(/The figures could not be loaded/))
                    .textContent
            ).toMatch(/internal_error/);
            // the sentence is in pieces (who, what, to what); " published " is one
            expect(await screen.findByText(/published/)).toBeTruthy();
            expect(screen.queryByLabelText('Loading the figures')).toBeNull();
        });

        it('still shows the figures if the latest activity cannot be loaded', async () => {
            adminListActivity.mockRejectedValue(new TypeError('network'));
            await renderPanel();
            expect(
                screen.getByText(/The latest activity could not be loaded/)
            ).toBeTruthy();
            expect(within(tile('Users')).getByText('12')).toBeTruthy();
        });
    });

    describe('loading', () => {
        it('shows placeholders for the tiles until the figures arrive', async () => {
            adminStats.mockReturnValue(new Promise(() => undefined));
            render(
                <MemoryRouter>
                    <OverviewPanel />
                </MemoryRouter>
            );
            expect(screen.getByLabelText('Loading the figures')).toBeTruthy();
            expect(screen.queryByText('Users')).toBeNull();
        });
    });

    describe('Refresh', () => {
        it('asks again and shows the new figures', async () => {
            await renderPanel();
            adminStats.mockResolvedValue(stats({ projects: 9 }));

            fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

            await waitFor(() =>
                expect(within(tile('Projects')).getByText('9')).toBeTruthy()
            );
            expect(adminStats).toHaveBeenCalledTimes(2);
            expect(adminListActivity).toHaveBeenCalledTimes(2);
        });

        it('keeps what is on screen while it asks, instead of going blank', async () => {
            await renderPanel();
            adminStats.mockReturnValue(new Promise(() => undefined));

            fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

            // the old figures stay, and there is no placeholder
            expect(within(tile('Users')).getByText('12')).toBeTruthy();
            expect(screen.queryByLabelText('Loading the figures')).toBeNull();
            expect(
                (
                    screen.getByRole('button', {
                        name: 'Refresh',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(true);
        });

        it('says when the figures were taken', async () => {
            await renderPanel();
            expect(screen.getByText(/^Updated \d/)).toBeTruthy();
        });
    });
});
