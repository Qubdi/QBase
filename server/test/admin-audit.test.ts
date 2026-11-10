import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    actionsInGroup,
    AUDIT_ACTIONS,
    AUDIT_GROUP_NAMES,
} from '../src/audit/audit.js';
import {
    ACTIVITY_MAX_LIMIT,
    decodeCursor,
    encodeCursor,
} from '../src/audit/activity.js';import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

interface Row {
    id: number;
    at: string;
    action: string;
    userId: string | null;
    userEmail: string | null;
    diagramId: string | null;
    diagramTitle: string | null;
    projectId: string | null;
    projectName: string | null;
    targetUserId: string | null;
    targetUserEmail: string | null;
    meta: Record<string, unknown> | null;
}

interface ActivityPage {
    items: Row[];
    nextCursor: string | null;
}

describe('GET /admin/audit', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;
    let diagramId: string;

    const list = (user: TestUser | null, query = '') =>
        ctx.app.inject({
            url: `/admin/audit${query}`,
            headers: user ? as(user) : {},
        });

    const page = async (query = ''): Promise<ActivityPage> => {
        const res = await list(admin, query);
        expect(res.statusCode).toBe(200);
        return res.json();
    };

    const call = (
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        payload?: object
    ) => ctx.app.inject({ method, url, headers: as(admin), payload });

    /** Rows for a made-up actor, so a test sees only what it inserted. */
    const insertAs = async (
        userId: string,
        rows: { action: string; at: string; meta?: object }[]
    ) => {
        for (const r of rows) {
            await ctx.db.execute(
                sql`insert into audit_log (user_id, action, at, meta)
                    values (${userId}, ${r.action}, ${r.at}::timestamptz,
                            ${r.meta ? JSON.stringify(r.meta) : null}::jsonb)`
            );
        }
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        // the first account is the admin
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        diagramId = await createDiagram(ctx.app, admin);
    });
    afterAll(() => ctx.close());

    it('requires login and hides itself from non-admins', async () => {
        expect((await list(null)).statusCode).toBe(401);
        expect((await list(member)).statusCode).toBe(404);
    });

    it('lists newest first with the actor email', async () => {
        const { items } = await page();
        expect(items.length).toBeGreaterThan(0);
        const ats = items.map((r) => Date.parse(r.at));
        expect([...ats].sort((a, b) => b - a)).toEqual(ats);
        expect(
            items.some(
                (r) =>
                    r.action === 'diagram.create' &&
                    r.userEmail === 'admin@example.com'
            )
        ).toBe(true);
    });

    describe('filters', () => {
        it('by action', async () => {
            const { items } = await page('?action=diagram.create');
            expect(items.length).toBeGreaterThan(0);
            expect(items.every((r) => r.action === 'diagram.create')).toBe(
                true
            );
        });

        it('by diagram', async () => {
            const { items } = await page(`?diagramId=${diagramId}`);
            expect(items.length).toBeGreaterThan(0);
            expect(items.every((r) => r.diagramId === diagramId)).toBe(true);
        });

        it('by actor', async () => {
            const { items } = await page(`?userId=${admin.id}`);
            expect(items.length).toBeGreaterThan(0);
            expect(items.every((r) => r.userId === admin.id)).toBe(true);
            // someone who did nothing has no rows (signing in is itself logged)
            expect((await page(`?userId=${randomUUID()}`)).items).toEqual([]);
            const theirs = (await page(`?userId=${member.id}`)).items;
            expect(theirs.every((r) => r.userId === member.id)).toBe(true);
        });

        it('by group: only that kind of action', async () => {
            const inGroup = async (group: string) =>
                (await page(`?group=${group}&limit=100`)).items;
            const users = await inGroup('users');
            expect(users.length).toBeGreaterThan(0);
            expect(users.every((r) => r.action.startsWith('user.'))).toBe(true);
            const projects = await inGroup('projects');
            expect(projects.length).toBeGreaterThan(0);
            expect(
                projects.every(
                    (r) =>
                        r.action.startsWith('project.') ||
                        r.action.startsWith('connection.')
                )
            ).toBe(true);
            expect((await list(admin, '?group=nonsense')).statusCode).toBe(400);
        });

        it('by date range, both ends included', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                { action: 'diagram.publish', at: '2020-03-01T10:00:00Z' },
                { action: 'diagram.publish', at: '2020-03-02T10:00:00Z' },
                { action: 'diagram.publish', at: '2020-03-03T10:00:00Z' },
            ]);
            const days = async (query: string) =>
                (await page(`?userId=${actor}${query}`)).items.map((r) =>
                    r.at.slice(0, 10)
                );
            expect(await days('')).toEqual([
                '2020-03-03',
                '2020-03-02',
                '2020-03-01',
            ]);
            expect(
                await days('&from=2020-03-02T10:00:00Z&to=2020-03-03T10:00:00Z')
            ).toEqual(['2020-03-03', '2020-03-02']);
            expect(await days('&to=2020-03-01T23:59:59Z')).toEqual([
                '2020-03-01',
            ]);
            expect(await days('&from=2021-01-01')).toEqual([]);
        });

        it('can leave out saves, the most frequent action', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                { action: 'diagram.update', at: '2020-04-01T10:00:00Z' },
                { action: 'diagram.publish', at: '2020-04-01T10:01:00Z' },
                { action: 'diagram.update', at: '2020-04-01T10:02:00Z' },
            ]);
            const actions = async (query: string) =>
                (await page(`?userId=${actor}${query}`)).items.map(
                    (r) => r.action
                );
            expect(await actions('')).toHaveLength(3);
            expect(await actions('&saves=show')).toHaveLength(3);
            expect(await actions('&saves=hide')).toEqual(['diagram.publish']);
        });

        it('rejects a malformed filter', async () => {
            expect((await list(admin, '?userId=nope')).statusCode).toBe(400);
            expect((await list(admin, '?from=yesterday')).statusCode).toBe(
                400
            );
            expect((await list(admin, '?saves=maybe')).statusCode).toBe(400);
        });
    });

    describe('cursor paging', () => {
        it('visits every row once, newest first, across ties and microseconds', async () => {
            const actor = randomUUID();
            // equal times (ordered by id), times that differ by microseconds
            // inside one millisecond (a Date would round them together), and a
            // later and an earlier one
            const times = [
                '2021-06-01T12:00:00.500000Z',
                '2021-06-01T12:00:00.500000Z',
                '2021-06-01T12:00:00.500000Z',
                '2021-06-01T12:00:00.123456Z',
                '2021-06-01T12:00:00.123100Z',
                '2021-06-01T12:00:00.123900Z',
                '2021-06-01T12:00:00.123456Z',
                '2021-06-01T12:00:01.000000Z',
                '2021-06-01T11:59:59.999999Z',
            ];
            await insertAs(
                actor,
                times.map((at) => ({ action: 'diagram.publish', at }))
            );
            const expected: number[] = (
                await ctx.db.execute(
                    sql`select id from audit_log where user_id = ${actor}
                        order by at desc, id desc`
                )
            ).rows.map((r) => Number(r.id));
            expect(expected).toHaveLength(times.length);

            for (const size of [1, 2, 4, 9, 20]) {
                const seen: number[] = [];
                let cursor: string | null = null;
                for (let guard = 0; guard < 20; guard++) {
                    const next: ActivityPage = await page(
                        `?userId=${actor}&limit=${size}${cursor ? `&cursor=${cursor}` : ''}`
                    );
                    expect(next.items.length).toBeLessThanOrEqual(size);
                    seen.push(...next.items.map((r) => r.id));
                    cursor = next.nextCursor;
                    if (!cursor) break;
                    // a page that is not the last one is full
                    expect(next.items).toHaveLength(size);
                }
                expect(seen, `page size ${size}`).toEqual(expected);
            }
        });

        it('gives no cursor when everything fits on one page', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                { action: 'diagram.publish', at: '2022-01-01T00:00:00Z' },
                { action: 'diagram.publish', at: '2022-01-02T00:00:00Z' },
            ]);
            expect((await page(`?userId=${actor}&limit=2`)).nextCursor).toBe(
                null
            );
            expect(
                (await page(`?userId=${actor}&limit=1`)).nextCursor
            ).toEqual(expect.any(String));
        });

        it('keeps filtering when a cursor is passed on', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                { action: 'diagram.publish', at: '2023-01-01T00:00:00Z' },
                { action: 'share.create', at: '2023-01-02T00:00:00Z' },
                { action: 'diagram.publish', at: '2023-01-03T00:00:00Z' },
                { action: 'share.create', at: '2023-01-04T00:00:00Z' },
                { action: 'diagram.publish', at: '2023-01-05T00:00:00Z' },
            ]);
            const first = await page(
                `?userId=${actor}&group=diagrams&limit=2`
            );
            const second = await page(
                `?userId=${actor}&group=diagrams&limit=2&cursor=${first.nextCursor}`
            );
            expect(
                [...first.items, ...second.items].map((r) => r.at.slice(0, 10))
            ).toEqual(['2023-01-05', '2023-01-03', '2023-01-01']);
            expect(second.nextCursor).toBe(null);
        });

        it('refuses a made-up cursor and a limit that is too large', async () => {
            expect((await list(admin, '?cursor=hello')).statusCode).toBe(400);
            const wrongId = Buffer.from(
                '2021-06-01T12:00:00.000000Z|1; select 1'
            ).toString('base64url');
            expect((await list(admin, `?cursor=${wrongId}`)).statusCode).toBe(
                400
            );
            expect((await list(admin, '?limit=0')).statusCode).toBe(400);
            expect(
                (await list(admin, `?limit=${ACTIVITY_MAX_LIMIT + 1}`))
                    .statusCode
            ).toBe(400);
            expect(
                (await list(admin, `?limit=${ACTIVITY_MAX_LIMIT}`)).statusCode
            ).toBe(200);
        });
    });

    describe('the names behind the ids', () => {
        it('shows names that exist, and the recorded name once they are gone', async () => {
            const created = await call('POST', '/admin/projects', {
                name: 'Billing',
            });
            const projectId = created.json().id;
            const titled = await createDiagram(ctx.app, admin, 'Orders');

            const latest = async (action: string) =>
                (await page(`?action=${action}&limit=1`)).items[0];

            // while they exist, the current name wins
            await call('PATCH', `/admin/projects/${projectId}`, {
                name: 'Invoicing',
            });
            const made = await latest('project.create');
            expect(made.projectId).toBe(projectId);
            expect(made.projectName).toBe('Invoicing');
            const diagramRow = await latest('diagram.create');
            expect(diagramRow.diagramId).toBe(titled);
            expect(diagramRow.diagramTitle).toBe('Orders');

            // once they are gone, what the row recorded
            await call('DELETE', `/diagrams/${titled}`);
            await call('DELETE', `/admin/projects/${projectId}`);
            const afterCreate = await latest('project.create');
            expect(afterCreate.projectId).toBe(projectId);
            expect(afterCreate.projectName).toBe('Billing'); // as it was named then
            const afterDelete = await latest('project.delete');
            expect(afterDelete.projectId).toBe(projectId);
            expect(afterDelete.projectName).toBe('Invoicing');
            const removed = await latest('diagram.delete');
            expect(removed.diagramTitle).toBe('Orders');
            // and the rows made before the deletion still say who and what
            const { items } = await page(`?diagramId=${titled}&limit=100`);
            expect(items.length).toBeGreaterThanOrEqual(2);
            expect(items.every((r) => r.diagramTitle === 'Orders')).toBe(true);
        });

        it('names the person an admin acted on, and keeps the row when they are deleted', async () => {
            const created = await call('POST', '/admin/users', {
                email: 'target@example.com',
                password: 'Password-123!',
            });
            const targetId = created.json().id;

            const row = (await page('?action=user.create&limit=1')).items[0];
            expect(row.targetUserId).toBe(targetId);
            expect(row.targetUserEmail).toBe('target@example.com');
            expect(row.userEmail).toBe('admin@example.com');

            await call('DELETE', `/admin/users/${targetId}`);
            const after = (await page('?action=user.create&limit=1')).items[0];
            expect(after.targetUserId).toBe(targetId);
            expect(after.targetUserEmail).toBe(null);
        });

        it('records whether an account was created as an admin', async () => {
            const plain = await call('POST', '/admin/users', { email: 'plain@example.com', password: 'Password-123!' });
            const boss = await call('POST', '/admin/users', { email: 'boss@example.com', password: 'Password-123!', isAdmin: true });
            const rows = (await page('?action=user.create&limit=10')).items;
            const adminFlag = (id: string) => rows.find((r) => r.targetUserId === id)?.meta?.isAdmin;
            expect(adminFlag(plain.json().id)).toBe(false);
            expect(adminFlag(boss.json().id)).toBe(true);
        });

        it('has no email for an actor whose account is gone', async () => {
            const ghost = randomUUID();
            await insertAs(ghost, [
                { action: 'diagram.publish', at: '2024-01-01T00:00:00Z' },
            ]);
            const [row] = (await page(`?userId=${ghost}`)).items;
            expect(row.userId).toBe(ghost);
            expect(row.userEmail).toBe(null);
        });

        it('does not take a project name for a diagram title, or the reverse', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                {
                    action: 'project.delete',
                    at: '2024-02-01T00:00:00Z',
                    meta: { projectId: randomUUID(), name: 'Old project' },
                },
                {
                    action: 'diagram.delete',
                    at: '2024-02-02T00:00:00Z',
                    meta: { projectId: randomUUID(), name: 'Old diagram' },
                },
            ]);
            const [diagram, project] = (await page(`?userId=${actor}`)).items;
            expect(diagram.diagramTitle).toBe('Old diagram');
            expect(diagram.projectName).toBe(null);
            expect(project.projectName).toBe('Old project');
            expect(project.diagramTitle).toBe(null);
        });

        it('still answers when meta holds a value that is not an id', async () => {
            const actor = randomUUID();
            await insertAs(actor, [
                {
                    action: 'project.member_set',
                    at: '2024-03-01T00:00:00Z',
                    meta: { projectId: 'not-a-uuid', targetUserId: '42' },
                },
            ]);
            const res = await list(admin, `?userId=${actor}`);
            expect(res.statusCode).toBe(200);
            const [row] = res.json().items as Row[];
            expect(row.projectName).toBe(null);
            expect(row.targetUserEmail).toBe(null);
        });
    });
});

describe('audit groups', () => {
    it('puts every action in exactly one group', () => {
        for (const action of AUDIT_ACTIONS) {
            const groups = AUDIT_GROUP_NAMES.filter((g) =>
                actionsInGroup(g).includes(action)
            );
            expect(groups, action).toHaveLength(1);
        }
    });

    it('has no empty group', () => {
        for (const group of AUDIT_GROUP_NAMES) {
            expect(actionsInGroup(group).length, group).toBeGreaterThan(0);
        }
    });
});

describe('activity cursor', () => {
    it('round-trips', () => {
        const cursor = { at: '2021-06-01T12:00:00.123456Z', id: 987654321 };
        expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });

    it('accepts the last day of a month and a leap day', () => {
        for (const at of ['2021-01-31T23:59:59.999999Z', '2024-02-29T00:00:00.000000Z']) {
            expect(decodeCursor(encodeCursor({ at, id: 1 }))).toEqual({ at, id: 1 });
        }
    });

    it('refuses anything this server did not issue', () => {
        const encode = (text: string) =>
            Buffer.from(text).toString('base64url');
        for (const bad of [
            '',
            'hello',
            encode('2021-06-01T12:00:00Z|5'), // no microseconds
            encode('2021-06-01T12:00:00.123456Z|-5'),
            encode('2021-06-01T12:00:00.123456Z|5; drop table audit_log'),
            encode("2021-06-01T12:00:00.123456Z'|5"),
            encode('2021-13-45T99:00:00.123456Z|5'), // not a real time
            encode('2021-02-31T12:00:00.123456Z|5'), // no such day: Date.parse would roll it to March
            encode('2021-04-31T12:00:00.123456Z|5'),
            encode('2021-06-01T12:00:00.123456Z|99999999999999999999'),
        ]) {
            expect(decodeCursor(bad), bad).toBeNull();
        }
    });
});
