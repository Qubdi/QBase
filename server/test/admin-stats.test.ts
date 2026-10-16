import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from '../src/audit/audit.js';
import { ACTIVITY_DAYS } from '../src/admin/stats.js';
import { diagramLocks, shareLinks } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

interface Stats {
    users: { total: number; active: number; admins: number; signedIn: number };
    projects: number;
    diagrams: { total: number; published: number };
    activeLinks: number;
    editingNow: number;
    driftChecks24h: number;
    activity: { timeZone: string; days: { day: string; events: number }[] };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TBILISI = 'Asia/Tbilisi'; // UTC+4, no daylight saving

/** `YYYY-MM-DD` of an instant in a zone, the way the server names a day. */
const dayIn = (instant: number, zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant);

/** Midnight at the start of a local day in Tbilisi, as an instant. */
const tbilisiMidnight = (day: string) => Date.parse(`${day}T00:00:00+04:00`);

describe('GET /admin/stats', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;

    const call = (who: TestUser | null, query = '') =>
        ctx.app.inject({ url: `/admin/stats${query}`, headers: who ? as(who) : {} });

    const stats = async (query = ''): Promise<Stats> => {
        const res = await call(admin, query);
        expect(res.statusCode, res.body).toBe(200);
        return res.json();
    };

    const log = (action: string, at: number, userId: string = randomUUID()) =>
        ctx.db.execute(
            sql`insert into audit_log (user_id, action, at)
                values (${userId}, ${action}, ${new Date(at).toISOString()}::timestamptz)`
        );

    const clearLog = () => ctx.db.execute(sql`delete from audit_log`);

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
    });
    afterAll(() => ctx.close());

    it('is for admins only', async () => {
        expect((await call(null)).statusCode).toBe(401);
        expect((await call(member)).statusCode).toBe(404);
    });

    describe('the counts', () => {
        it('counts people: all of them, those who can sign in, admins, and who is signed in', async () => {
            const gone = await registerUser(ctx.app, 'disabled@example.com');
            await ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${gone.id}`,
                headers: as(admin),
                payload: { isActive: false },
            });
            const s = await stats();
            // admin, member and the disabled one
            expect(s.users).toEqual({ total: 3, active: 2, admins: 1, signedIn: 2 });
        });

        it('counts projects and diagrams, and the diagrams that have been published', async () => {
            const a = await createDiagram(ctx.app, admin, 'One');
            await createDiagram(ctx.app, admin, 'Two');
            const before = await stats();
            expect(before.diagrams).toEqual({ total: 2, published: 0 });
            expect(before.projects).toBe(1);

            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${a}/publish`,
                headers: as(admin),
                payload: {},
            });
            // publishing a second time is still one published diagram
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${a}/publish`,
                headers: as(admin),
                payload: {},
            });
            expect((await stats()).diagrams).toEqual({ total: 2, published: 1 });
        });

        it('counts only the share links that can be opened', async () => {
            const id = await createDiagram(ctx.app, admin, 'Shared');
            const make = async (body: object = {}) =>
                (
                    await ctx.app.inject({
                        method: 'POST',
                        url: `/diagrams/${id}/share-links`,
                        headers: as(admin),
                        payload: body,
                    })
                ).json().id as string;
            const base = (await stats()).activeLinks;

            await make();
            await make({ access: 'signed_in' });
            const off = await make();
            await ctx.app.inject({
                method: 'PATCH',
                url: `/diagrams/${id}/share-links/${off}`,
                headers: as(admin),
                payload: { access: 'off' },
            });
            const revoked = await make();
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${id}/share-links/${revoked}`,
                headers: as(admin),
            });
            const expired = await make();
            await ctx.db
                .update(shareLinks)
                .set({ expiresAt: new Date(Date.now() - 60_000) })
                .where(eq(shareLinks.id, expired));

            // five made: two can be opened (the plain one and the signed-in one)
            expect((await stats()).activeLinks - base).toBe(2);
        });

        it('counts the diagrams being edited now, and not a lease that ran out', async () => {
            const live = await createDiagram(ctx.app, admin, 'Being edited');
            const stale = await createDiagram(ctx.app, admin, 'Left open');
            const base = (await stats()).editingNow;
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${live}/lock`,
                headers: as(admin),
                payload: { editorId: 'a' },
            });
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${stale}/lock`,
                headers: as(admin),
                payload: { editorId: 'b' },
            });
            expect((await stats()).editingNow).toBe(base + 2);

            await ctx.db
                .update(diagramLocks)
                .set({ expiresAt: new Date(Date.now() - 60_000) })
                .where(eq(diagramLocks.diagramId, stale));
            expect((await stats()).editingNow).toBe(base + 1);
        });

        it('counts the database drift checks of the last 24 hours, to the minute', async () => {
            await clearLog();
            const now = Date.now();
            await log('drift.check', now - 5 * 60_000);
            await log('drift.check', now - (DAY - 2 * 60_000)); // just inside
            await log('drift.check', now - (DAY + 2 * 60_000)); // just outside
            await log('drift.configure', now - HOUR); // not a check
            await log('drift.dismiss', now - HOUR);
            expect((await stats()).driftChecks24h).toBe(2);
        });
    });

    describe('the activity chart', () => {
        const eventsByDay = (s: Stats) => Object.fromEntries(s.activity.days.map((d) => [d.day, d.events]));

        it('has one row for each of the last seven days, oldest first, today last', async () => {
            await clearLog();
            const s = await stats(`?tz=${TBILISI}`);
            expect(s.activity.timeZone).toBe(TBILISI);
            expect(s.activity.days).toHaveLength(ACTIVITY_DAYS);
            const today = dayIn(Date.now(), TBILISI);
            expect(s.activity.days.at(-1)!.day).toBe(today);
            const names = s.activity.days.map((d) => d.day);
            expect([...names].sort()).toEqual(names);
            // consecutive days, no gap
            for (let i = 1; i < names.length; i++) {
                expect(Date.parse(names[i]) - Date.parse(names[i - 1])).toBe(DAY);
            }
            expect(s.activity.days.every((d) => d.events === 0)).toBe(true);
        });

        it('counts what happened on each day', async () => {
            await clearLog();
            const today = dayIn(Date.now(), TBILISI);
            const noon = (daysAgo: number) => tbilisiMidnight(today) - daysAgo * DAY + 12 * HOUR;
            await log('diagram.publish', noon(0));
            await log('share.create', noon(0));
            await log('project.create', noon(2));
            await log('user.create', noon(6));
            const by = eventsByDay(await stats(`?tz=${TBILISI}`));
            const day = (n: number) => dayIn(tbilisiMidnight(today) - n * DAY + 12 * HOUR, TBILISI);
            expect(by[day(0)]).toBe(2);
            expect(by[day(1)]).toBe(0);
            expect(by[day(2)]).toBe(1);
            expect(by[day(6)]).toBe(1);
        });

        it('leaves out saves, which would drown everything else', async () => {
            await clearLog();
            for (let i = 0; i < 50; i++) await log('diagram.update', Date.now() - i * 60_000);
            await log('diagram.publish', Date.now() - 60_000);
            const total = (await stats()).activity.days.reduce((n, d) => n + d.events, 0);
            expect(total).toBe(1);
        });

        it('counts every other action, so a new one cannot be missed', async () => {
            await clearLog();
            const at = Date.now() - 60_000;
            for (const action of AUDIT_ACTIONS) await log(action, at);
            const total = (await stats()).activity.days.reduce((n, d) => n + d.events, 0);
            expect(total).toBe(AUDIT_ACTIONS.length - 1);
        });

        it('starts at the beginning of the day six days ago, to the minute', async () => {
            await clearLog();
            const today = dayIn(Date.now(), TBILISI);
            const start = tbilisiMidnight(today) - 6 * DAY;
            await log('diagram.publish', start - 60_000); // the minute before: out
            await log('diagram.publish', start); // the first instant: in
            const s = await stats(`?tz=${TBILISI}`);
            expect(s.activity.days.reduce((n, d) => n + d.events, 0)).toBe(1);
            expect(s.activity.days[0].events).toBe(1);
        });

        it('does not count tomorrow, or anything older than the window', async () => {
            await clearLog();
            await log('diagram.publish', Date.now() - 30 * DAY);
            const s = await stats();
            expect(s.activity.days.reduce((n, d) => n + d.events, 0)).toBe(0);
        });

        it('puts an event on the day it was in the viewer\'s zone, not in UTC', async () => {
            await clearLog();
            // 21:00 UTC is already the next day in Tbilisi (UTC+4)
            const today = dayIn(Date.now(), 'UTC');
            const at = Date.parse(`${today}T00:00:00Z`) - 3 * HOUR; // 21:00 UTC the day before
            await log('diagram.publish', at);

            const utc = eventsByDay(await stats('?tz=UTC'));
            const tbilisi = eventsByDay(await stats(`?tz=${TBILISI}`));

            expect(utc[dayIn(at, 'UTC')]).toBe(1);
            expect(tbilisi[dayIn(at, TBILISI)]).toBe(1);
            expect(dayIn(at, 'UTC')).not.toBe(dayIn(at, TBILISI));
            // and nothing is counted twice
            expect(Object.values(utc).reduce((a, b) => a + b, 0)).toBe(1);
            expect(Object.values(tbilisi).reduce((a, b) => a + b, 0)).toBe(1);
        });

        it('shows UTC days when no zone is given', async () => {
            expect((await stats()).activity.timeZone).toBe('UTC');
        });

        it('refuses a time zone that does not exist', async () => {
            expect((await call(admin, '?tz=Mars/Olympus')).statusCode).toBe(400);
            expect((await call(admin, '?tz=')).statusCode).toBe(400);
            expect((await call(admin, `?tz=${'x'.repeat(100)}`)).statusCode).toBe(400);
        });
    });
});
