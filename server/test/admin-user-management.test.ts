import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_SET_LOCK } from '../src/admin/routes.js';
import { createSession } from '../src/auth/sessions.js';
import {
    auditLog,
    diagramLocks,
    diagrams,
    sessions,
    users,
} from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

interface ListedUser {
    id: string;
    email: string;
    isActive: boolean;
    lastLoginAt: string | null;
    lastActiveAt: string | null;
}

const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('managing users: last sign-in, sessions and bulk actions', () => {
    let ctx: TestCtx;
    let admin: TestUser;

    const call = (
        who: TestUser | null,
        method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
        url: string,
        payload?: object
    ) =>
        ctx.app.inject({
            method,
            url,
            headers: who ? as(who) : {},
            payload,
        });

    /** A new account, signed in from a browser that says what it is. */
    const person = async (
        email: string,
        userAgent: string | undefined = CHROME
    ): Promise<TestUser> => {
        const made = await registerUser(ctx.app, email);
        if (userAgent) {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                headers: { 'user-agent': userAgent },
                payload: { email, password: 'Password-123!' },
            });
            expect(res.statusCode).toBe(200);
            const set = res.cookies.find((c) => c.name === 'qubdidb_session')!;
            return { ...made, cookie: `qubdidb_session=${set.value}` };
        }
        return made;
    };

    const listed = async (id: string): Promise<ListedUser> => {
        const res = await call(admin, 'GET', '/admin/users?limit=100');
        expect(res.statusCode).toBe(200);
        return (res.json().items as ListedUser[]).find((u) => u.id === id)!;
    };

    const stillSignedIn = async (who: TestUser) =>
        (await call(who, 'GET', '/auth/me')).statusCode === 200;

    const rowsFor = (action: string) =>
        ctx.db.select().from(auditLog).where(eq(auditLog.action, action));

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    describe('last sign-in and who is signed in', () => {
        it('has neither for an account nobody has signed in to', async () => {
            const made = await registerUser(ctx.app, 'never@example.com', 'Password-123!');
            // registerUser signs in; end that session to get a fresh account
            await call(admin, 'DELETE', `/admin/users/${made.id}/sessions`);
            await ctx.db
                .update(users)
                .set({ lastLoginAt: null })
                .where(eq(users.id, made.id));
            const row = await listed(made.id);
            expect(row.lastLoginAt).toBeNull();
            expect(row.lastActiveAt).toBeNull();
        });

        it('shows when they signed in, and that they are signed in now', async () => {
            const anna = await person('anna@example.com');
            const row = await listed(anna.id);
            expect(Date.now() - Date.parse(row.lastLoginAt!)).toBeLessThan(60_000);
            expect(Date.now() - Date.parse(row.lastActiveAt!)).toBeLessThan(60_000);
        });

        it('reports the session\'s last use as their last activity', async () => {
            const bob = await person('bob@example.com');
            const when = new Date(Date.now() - 3 * 3_600_000);
            await ctx.db
                .update(sessions)
                .set({ lastSeenAt: when })
                .where(eq(sessions.userId, bob.id));
            expect(Date.parse((await listed(bob.id)).lastActiveAt!)).toBe(
                when.getTime()
            );
        });

        it('keeps the last sign-in but is no longer "signed in" once the session expires', async () => {
            const cara = await person('cara@example.com');
            await ctx.db
                .update(sessions)
                .set({ expiresAt: new Date(Date.now() - 60_000) })
                .where(eq(sessions.userId, cara.id));
            const row = await listed(cara.id);
            expect(row.lastLoginAt).not.toBeNull();
            expect(row.lastActiveAt).toBeNull();
        });

        it('says so for every user on a page, from one lookup of the page', async () => {
            const res = await call(admin, 'GET', '/admin/users?limit=100');
            const items = res.json().items as ListedUser[];
            expect(items.length).toBeGreaterThan(3);
            for (const u of items) {
                expect(u).toHaveProperty('lastLoginAt');
                expect(u).toHaveProperty('lastActiveAt');
            }
        });
    });

    describe('GET /admin/users/:id/sessions', () => {
        it('lists the live session with when and from which browser, and nothing secret', async () => {
            const dave = await person('dave@example.com');
            const res = await call(admin, 'GET', `/admin/users/${dave.id}/sessions`);
            expect(res.statusCode).toBe(200);
            const list = res.json();
            expect(list).toHaveLength(1);
            expect(Object.keys(list[0]).sort()).toEqual([
                'createdAt',
                'expiresAt',
                'lastSeenAt',
                'userAgent',
            ]);
            expect(list[0].userAgent).toBe(CHROME);
            // not the hash that stands for the cookie, nor anything like it
            expect(res.body).not.toContain(dave.cookie.split('=')[1]);
            const [row] = await ctx.db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, dave.id));
            expect(res.body).not.toContain(row.id);
        });

        it('has a null browser for a session that did not say', async () => {
            const eve = await person('eve@example.com', undefined);
            await createSession(ctx.db, eve.id, 7);
            const [session] = (
                await call(admin, 'GET', `/admin/users/${eve.id}/sessions`)
            ).json();
            expect(session.userAgent).toBeNull();
        });

        it('leaves out a session that has expired', async () => {
            const finn = await person('finn@example.com');
            await ctx.db
                .update(sessions)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(sessions.userId, finn.id));
            expect(
                (await call(admin, 'GET', `/admin/users/${finn.id}/sessions`)).json()
            ).toEqual([]);
        });

        it('is an empty list for an account that is not signed in', async () => {
            const made = await person('quiet@example.com', undefined);
            await ctx.db.delete(sessions).where(eq(sessions.userId, made.id));
            expect(
                (await call(admin, 'GET', `/admin/users/${made.id}/sessions`)).json()
            ).toEqual([]);
        });

        it('is for admins only, and for accounts that exist', async () => {
            const gus = await person('gus@example.com');
            expect((await call(null, 'GET', `/admin/users/${gus.id}/sessions`)).statusCode).toBe(401);
            expect((await call(gus, 'GET', `/admin/users/${gus.id}/sessions`)).statusCode).toBe(404);
            expect(
                (
                    await call(
                        admin,
                        'GET',
                        '/admin/users/00000000-0000-4000-8000-000000000000/sessions'
                    )
                ).statusCode
            ).toBe(404);
            expect((await call(admin, 'GET', '/admin/users/nope/sessions')).statusCode).toBe(400);
        });
    });

    describe('DELETE /admin/users/:id/sessions (sign out everywhere)', () => {
        it('ends the session at once and records who did it to whom', async () => {
            const hana = await person('hana@example.com');
            expect(await stillSignedIn(hana)).toBe(true);

            const res = await call(admin, 'DELETE', `/admin/users/${hana.id}/sessions`);

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ signedOut: 1 });
            expect(await stillSignedIn(hana)).toBe(false);
            expect((await listed(hana.id)).lastActiveAt).toBeNull();
            const rows = (await rowsFor('user.sign_out')).filter(
                (r) => r.meta?.targetUserId === hana.id
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].userId).toBe(admin.id);
            expect(rows[0].meta).toEqual({ targetUserId: hana.id });
        });

        it('can be signed in to again afterwards', async () => {
            const ivan = await person('ivan@example.com');
            await call(admin, 'DELETE', `/admin/users/${ivan.id}/sessions`);
            const again = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'ivan@example.com', password: 'Password-123!' },
            });
            expect(again.statusCode).toBe(200);
        });

        it('says nothing was done, and writes no row, when they were not signed in', async () => {
            const jo = await person('jo@example.com');
            await call(admin, 'DELETE', `/admin/users/${jo.id}/sessions`);
            const before = (await rowsFor('user.sign_out')).length;

            const res = await call(admin, 'DELETE', `/admin/users/${jo.id}/sessions`);

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ signedOut: 0 });
            expect((await rowsFor('user.sign_out')).length).toBe(before);
        });

        it('does not count a session that had already expired', async () => {
            const kim = await person('kim@example.com');
            await ctx.db
                .update(sessions)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(sessions.userId, kim.id));
            const before = (await rowsFor('user.sign_out')).length;
            const res = await call(admin, 'DELETE', `/admin/users/${kim.id}/sessions`);
            expect(res.json()).toEqual({ signedOut: 0 });
            expect((await rowsFor('user.sign_out')).length).toBe(before);
        });

        it('lets go of the diagrams they were editing', async () => {
            const lena = await person('lena@example.com');
            await grant(ctx.app, lena, 'editor');
            const id = await createDiagram(ctx.app, lena, 'Lena diagram');
            const locked = await call(lena, 'POST', `/diagrams/${id}/lock`, {
                editorId: 'tab-1',
            });
            expect(locked.statusCode).toBe(200);
            expect(
                await ctx.db.select().from(diagramLocks).where(eq(diagramLocks.diagramId, id))
            ).toHaveLength(1);

            await call(admin, 'DELETE', `/admin/users/${lena.id}/sessions`);

            expect(
                await ctx.db.select().from(diagramLocks).where(eq(diagramLocks.diagramId, id))
            ).toHaveLength(0);
        });

        it('leaves everyone else signed in', async () => {
            const max = await person('max@example.com');
            const nina = await person('nina@example.com');
            await call(admin, 'DELETE', `/admin/users/${max.id}/sessions`);
            expect(await stillSignedIn(nina)).toBe(true);
            expect(await stillSignedIn(admin)).toBe(true);
        });

        it('refuses to sign the caller out of their own session', async () => {
            const res = await call(admin, 'DELETE', `/admin/users/${admin.id}/sessions`);
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('cannot_sign_out_self');
            expect(await stillSignedIn(admin)).toBe(true);
        });

        it('is for admins only, and for accounts that exist', async () => {
            const omar = await person('omar@example.com');
            const pia = await person('pia@example.com');
            expect((await call(null, 'DELETE', `/admin/users/${pia.id}/sessions`)).statusCode).toBe(401);
            expect((await call(omar, 'DELETE', `/admin/users/${pia.id}/sessions`)).statusCode).toBe(404);
            expect(await stillSignedIn(pia)).toBe(true);
            expect(
                (
                    await call(
                        admin,
                        'DELETE',
                        '/admin/users/00000000-0000-4000-8000-000000000000/sessions'
                    )
                ).statusCode
            ).toBe(404);
        });
    });

    describe('POST /admin/users/bulk', () => {
        const bulk = (who: TestUser | null, action: string, ids: string[]) =>
            call(who, 'POST', '/admin/users/bulk', { action, ids });

        const flags = async (ids: string[]) =>
            (
                await ctx.db
                    .select({ id: users.id, isActive: users.isActive })
                    .from(users)
                    .where(inArray(users.id, ids))
            ).reduce<Record<string, boolean>>((m, u) => ({ ...m, [u.id]: u.isActive }), {});

        const targetsOf = async (action: string, ids: string[]) =>
            (await rowsFor(action))
                .filter((r) => ids.includes(r.meta?.targetUserId ?? ''))
                .sort((a, b) => a.id - b.id);

        describe('disable', () => {
            it('turns off every account, ends their sessions and records each one', async () => {
                const a = await person('d1@example.com');
                const b = await person('d2@example.com');
                const c = await person('d3@example.com');

                const res = await bulk(admin, 'disable', [a.id, b.id, c.id]);

                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ changed: 3, unchanged: 0 });
                expect(await flags([a.id, b.id, c.id])).toEqual({
                    [a.id]: false,
                    [b.id]: false,
                    [c.id]: false,
                });
                for (const who of [a, b, c]) {
                    expect(await stillSignedIn(who)).toBe(false);
                    expect(
                        await ctx.db.select().from(sessions).where(eq(sessions.userId, who.id))
                    ).toHaveLength(0);
                }
                const rows = await targetsOf('user.disable', [a.id, b.id, c.id]);
                expect(rows.map((r) => r.meta?.targetUserId).sort()).toEqual(
                    [a.id, b.id, c.id].sort()
                );
                expect(rows.every((r) => r.userId === admin.id)).toBe(true);
                // ids only: never an address
                expect(JSON.stringify(rows.map((r) => r.meta))).not.toContain('@');
            });

            it('lets go of the diagrams they were editing', async () => {
                const a = await person('dl@example.com');
                await grant(ctx.app, a, 'editor');
                const id = await createDiagram(ctx.app, a, 'Locked by dl');
                await call(a, 'POST', `/diagrams/${id}/lock`, { editorId: 'tab' });

                await bulk(admin, 'disable', [a.id]);

                expect(
                    await ctx.db.select().from(diagramLocks).where(eq(diagramLocks.diagramId, id))
                ).toHaveLength(0);
            });

            it('counts an account that is already disabled as unchanged, with no row', async () => {
                const a = await person('d4@example.com');
                const b = await person('d5@example.com');
                await bulk(admin, 'disable', [a.id]);
                const before = (await targetsOf('user.disable', [a.id, b.id])).length;

                const res = await bulk(admin, 'disable', [a.id, b.id]);

                expect(res.json()).toEqual({ changed: 1, unchanged: 1 });
                expect((await targetsOf('user.disable', [a.id, b.id])).length).toBe(before + 1);
            });
        });

        describe('enable', () => {
            it('turns accounts back on, and says what it did not need to', async () => {
                const a = await person('e1@example.com');
                const b = await person('e2@example.com');
                const alreadyOn = await person('e3@example.com');
                await bulk(admin, 'disable', [a.id, b.id]);

                const res = await bulk(admin, 'enable', [a.id, b.id, alreadyOn.id]);

                expect(res.json()).toEqual({ changed: 2, unchanged: 1 });
                expect(await flags([a.id, b.id, alreadyOn.id])).toEqual({
                    [a.id]: true,
                    [b.id]: true,
                    [alreadyOn.id]: true,
                });
                const rows = await targetsOf('user.enable', [a.id, b.id, alreadyOn.id]);
                expect(rows.map((r) => r.meta?.targetUserId).sort()).toEqual(
                    [a.id, b.id].sort()
                );
                // and they can sign in again
                const login = await ctx.app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: 'e1@example.com', password: 'Password-123!' },
                });
                expect(login.statusCode).toBe(200);
            });

            it('may include the caller: it changes nothing for them', async () => {
                const a = await person('e4@example.com');
                await bulk(admin, 'disable', [a.id]);
                const res = await bulk(admin, 'enable', [admin.id, a.id]);
                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ changed: 1, unchanged: 1 });
            });
        });

        describe('delete', () => {
            it('removes the accounts, keeps their diagrams with the admin, and records each', async () => {
                const a = await person('x1@example.com');
                const b = await person('x2@example.com');
                await grant(ctx.app, a, 'editor');
                const kept = await createDiagram(ctx.app, a, 'Survives its author');

                const res = await bulk(admin, 'delete', [a.id, b.id]);

                expect(res.json()).toEqual({ changed: 2, unchanged: 0 });
                expect(
                    await ctx.db.select().from(users).where(inArray(users.id, [a.id, b.id]))
                ).toHaveLength(0);
                const [diagram] = await ctx.db
                    .select({ ownerId: diagrams.ownerId })
                    .from(diagrams)
                    .where(eq(diagrams.id, kept));
                expect(diagram.ownerId).toBe(admin.id);
                expect(await stillSignedIn(a)).toBe(false);
                const rows = await targetsOf('user.delete', [a.id, b.id]);
                expect(rows).toHaveLength(2);
                expect(rows.every((r) => r.userId === admin.id)).toBe(true);
            });

            it('may delete an admin while another can still sign in', async () => {
                const other = await person('x3@example.com');
                await call(admin, 'PATCH', `/admin/users/${other.id}`, { isAdmin: true });
                const res = await bulk(admin, 'delete', [other.id]);
                expect(res.statusCode).toBe(200);
                expect(res.json().changed).toBe(1);
            });

            it('may delete an admin who is already disabled', async () => {
                const other = await person('x4@example.com');
                await call(admin, 'PATCH', `/admin/users/${other.id}`, { isAdmin: true });
                await call(admin, 'PATCH', `/admin/users/${other.id}`, { isActive: false });
                expect((await bulk(admin, 'delete', [other.id])).statusCode).toBe(200);
            });
        });

        describe('what it will not do', () => {
            it.each([
                ['disable', 'cannot_disable_self'],
                ['delete', 'cannot_delete_self'],
            ])('refuses to %s the caller, and changes nothing at all', async (action, error) => {
                const a = await person(`self-${action}@example.com`);
                const before = (await rowsFor(`user.${action}`)).length;

                const res = await bulk(admin, action, [a.id, admin.id]);

                expect(res.statusCode).toBe(400);
                expect(res.json().error).toBe(error);
                expect((await flags([a.id]))[a.id]).toBe(true);
                expect(await stillSignedIn(a)).toBe(true);
                expect(await stillSignedIn(admin)).toBe(true);
                expect((await rowsFor(`user.${action}`)).length).toBe(before);
            });

            it('counts a repeated id once', async () => {
                const a = await person('dup@example.com');
                const res = await bulk(admin, 'disable', [a.id, a.id, a.id]);
                expect(res.json()).toEqual({ changed: 1, unchanged: 0 });
                expect(await targetsOf('user.disable', [a.id])).toHaveLength(1);
            });

            it('counts an id that matches no account as unchanged', async () => {
                const a = await person('real@example.com');
                const res = await bulk(admin, 'disable', [
                    a.id,
                    '00000000-0000-4000-8000-000000000000',
                ]);
                expect(res.json()).toEqual({ changed: 1, unchanged: 1 });
                const none = await bulk(admin, 'delete', [
                    '00000000-0000-4000-8000-000000000000',
                ]);
                expect(none.json()).toEqual({ changed: 0, unchanged: 1 });
            });

            it('refuses a request that is not shaped right', async () => {
                const a = await person('shape@example.com');
                for (const body of [
                    {},
                    { action: 'disable' },
                    { ids: [a.id] },
                    { action: 'promote', ids: [a.id] },
                    { action: 'disable', ids: [] },
                    { action: 'disable', ids: ['nope'] },
                    { action: 'disable', ids: Array(101).fill(a.id) },
                    { action: 'disable', ids: a.id },
                ]) {
                    const res = await call(admin, 'POST', '/admin/users/bulk', body);
                    expect(res.statusCode, JSON.stringify(body)).toBe(400);
                }
                expect((await flags([a.id]))[a.id]).toBe(true);
            });

            it('takes a hundred ids at most, and exactly a hundred is fine', async () => {
                const ids = Array.from(
                    { length: 100 },
                    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
                );
                const res = await bulk(admin, 'delete', ids);
                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ changed: 0, unchanged: 100 });
            });

            it('is for admins only', async () => {
                const member = await person('member@example.com');
                const a = await person('victim@example.com');
                expect((await bulk(null, 'disable', [a.id])).statusCode).toBe(401);
                expect((await bulk(member, 'disable', [a.id])).statusCode).toBe(404);
                expect((await flags([a.id]))[a.id]).toBe(true);
            });
        });
    });
});

describe('bulk actions by two admins at once', () => {
    let ctx: TestCtx;
    let a: TestUser;
    let b: TestUser;

    beforeEach(async () => {
        ctx = await createTestApp();
        a = await registerUser(ctx.app, 'a@example.com');
        b = await registerUser(ctx.app, 'b@example.com');
        const res = await ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${b.id}`,
            headers: as(a),
            payload: { isAdmin: true },
        });
        expect(res.statusCode).toBe(200);
    });
    afterEach(() => ctx.close());

    const activeAdmins = async () =>
        (await ctx.db.select().from(users)).filter((u) => u.isAdmin && u.isActive).length;

    const bulk = (who: TestUser, action: string, ids: string[]) =>
        ctx.app.inject({
            method: 'POST',
            url: '/admin/users/bulk',
            headers: as(who),
            payload: { action, ids },
        });

    it.each(['disable', 'delete'])(
        'never ends with no admin when they %s each other',
        async (action) => {
            const [r1, r2] = await Promise.all([
                bulk(a, action, [b.id]),
                bulk(b, action, [a.id]),
            ]);
            // one wins; the other is refused, or has been signed out by then
            expect([r1.statusCode, r2.statusCode].filter((c) => c === 200)).toHaveLength(1);
            expect(await activeAdmins()).toBe(1);
        }
    );

    // The test above can pass because the loser is signed out before it
    // starts (401), which never reaches the check. This one holds the admin
    // lock so the request has passed sign-in and is waiting inside the route,
    // changes who is an admin meanwhile, and so shows the check itself.
    it.each(['disable', 'delete'])(
        'waits for the admin-set lock and looks again at who is left before a bulk %s',
        async (action) => {
            let settled = false;
            let pending!: Promise<{ statusCode: number; json: () => { error?: string } }>;
            await ctx.db.transaction(async (tx) => {
                await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK})`);
                pending = bulk(a, action, [b.id]).then((r) => {
                    settled = true;
                    return r;
                });
                await new Promise((r) => setTimeout(r, 400));
                expect(settled).toBe(false);
                // while it waits, the acting admin is the one turned off: once it
                // runs, taking b as well would leave nobody who can sign in
                await tx.update(users).set({ isActive: false }).where(eq(users.id, a.id));
            });

            const res = await pending;
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('last_admin');
            const [stillThere] = await ctx.db.select().from(users).where(eq(users.id, b.id));
            expect(stillThere?.isActive).toBe(true);
            expect(await activeAdmins()).toBe(1);
        }
    );
});
