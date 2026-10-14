import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('user status (active / disabled)', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;
    let other: TestUser;
    let diagramId: string;

    const patch = (who: TestUser, id: string, body: object) =>
        ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${id}`,
            headers: as(who),
            payload: body,
        });
    const login = (email: string, password = 'password123') =>
        ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email, password },
        });
    const get = (url: string, who: TestUser) =>
        ctx.app.inject({ url, headers: as(who) });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
        other = await registerUser(ctx.app, 'other@example.com');
        await grant(ctx.app, member, 'editor');
        diagramId = await createDiagram(ctx.app, member, 'Member diagram');
    });
    afterAll(() => ctx.close());

    it('starts every account as active', async () => {
        const res = await get('/admin/users', admin);
        expect(
            res.json().items.every((u: { isActive: boolean }) => u.isActive)
        ).toBe(true);
    });

    describe('disabling a user', () => {
        let oldSession: TestUser;

        beforeAll(async () => {
            oldSession = await loginUser(ctx.app, 'member@example.com');
            expect((await get('/auth/me', oldSession)).statusCode).toBe(200);
            const res = await patch(admin, member.id, { isActive: false });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({ id: member.id, isActive: false });
        });

        it('ends every session they had, at once', async () => {
            expect((await get('/auth/me', member)).statusCode).toBe(401);
            expect((await get('/auth/me', oldSession)).statusCode).toBe(401);
            expect((await get('/diagrams', oldSession)).statusCode).toBe(401);
            expect((await get(`/diagrams/${diagramId}`, oldSession)).statusCode).toBe(
                401
            );
        });

        it('refuses to sign them in, telling them why', async () => {
            const res = await login('member@example.com');
            expect(res.statusCode).toBe(403);
            expect(res.json().error).toBe('account_disabled');
            expect(res.cookies.find((c) => c.name === 'qubdidb_session')).toBeUndefined();
        });

        it('still answers a wrong password with the usual error, not the status', async () => {
            const res = await login('member@example.com', 'not-the-password');
            expect(res.statusCode).toBe(401);
            expect(res.json().error).toBe('invalid_credentials');
        });

        it('shows them as disabled in the list and the status filter', async () => {
            const all = (await get('/admin/users', admin)).json();
            const row = all.items.find((u: { id: string }) => u.id === member.id);
            expect(row.isActive).toBe(false);
            expect(all.total).toBe(3);

            const disabled = (await get('/admin/users?status=disabled', admin)).json();
            expect(disabled.total).toBe(1);
            expect(disabled.items[0].id).toBe(member.id);

            const active = (await get('/admin/users?status=active', admin)).json();
            expect(active.total).toBe(2);
            expect(active.items.map((u: { id: string }) => u.id)).not.toContain(
                member.id
            );
        });

        it('combines the status filter with search', async () => {
            const hit = (
                await get('/admin/users?status=disabled&q=member', admin)
            ).json();
            expect(hit.total).toBe(1);
            const miss = (
                await get('/admin/users?status=active&q=member', admin)
            ).json();
            expect(miss.total).toBe(0);
        });

        it('keeps their diagrams and project access intact', async () => {
            const projects = (await get('/admin/projects', admin)).json().items;
            expect(projects[0].members).toBe(1);
            expect(projects[0].diagrams).toBe(1);
            // an admin can still see the diagram
            expect((await get(`/diagrams/${diagramId}`, admin)).statusCode).toBe(200);
        });

        it('rejects an unknown status filter', async () => {
            expect((await get('/admin/users?status=banned', admin)).statusCode).toBe(
                400
            );
        });
    });

    describe('enabling a user again', () => {
        beforeAll(async () => {
            const res = await patch(admin, member.id, { isActive: true });
            expect(res.statusCode).toBe(200);
            expect(res.json().isActive).toBe(true);
        });

        it('lets them sign in, with the access they had before', async () => {
            const again = await loginUser(ctx.app, 'member@example.com');
            expect((await get('/auth/me', again)).statusCode).toBe(200);
            expect((await get(`/diagrams/${diagramId}`, again)).statusCode).toBe(200);
            const write = await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${diagramId}`,
                headers: as(again),
                payload: { title: 'Renamed after re-enable' },
            });
            expect(write.statusCode).toBe(200);
        });

        it('does not bring back the sessions that were ended', async () => {
            expect((await get('/auth/me', member)).statusCode).toBe(401);
        });
    });

    describe('guard rails', () => {
        it('does not let admins disable themselves', async () => {
            const res = await patch(admin, admin.id, { isActive: false });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('cannot_disable_self');
            expect((await get('/auth/me', admin)).statusCode).toBe(200);
        });

        it('does not let a non-admin change anyone’s status', async () => {
            const res = await patch(other, member.id, { isActive: false });
            expect(res.statusCode).toBe(404);
            const self = await patch(other, other.id, { isActive: false });
            expect(self.statusCode).toBe(404);
        });

        it('returns 404 for an unknown user and 400 for an empty update', async () => {
            expect(
                (
                    await patch(admin, '00000000-0000-4000-8000-000000000000', {
                        isActive: false,
                    })
                ).statusCode
            ).toBe(404);
            expect((await patch(admin, other.id, {})).statusCode).toBe(400);
        });

        it('counts only admins who can still sign in when protecting the last one', async () => {
            const second = await registerUser(ctx.app, 'second-admin@example.com');
            expect((await patch(admin, second.id, { isAdmin: true })).statusCode).toBe(
                200
            );
            const secondSession = await loginUser(ctx.app, 'second-admin@example.com');

            // two active admins: one may disable the other
            const off = await patch(secondSession, admin.id, { isActive: false });
            expect(off.statusCode).toBe(200);

            // now the second admin is the only one who can sign in: they stay
            const demote = await patch(secondSession, second.id, { isAdmin: false });
            expect(demote.statusCode).toBe(400);
            expect(demote.json().error).toBe('last_admin');
            const self = await patch(secondSession, second.id, { isActive: false });
            expect(self.statusCode).toBe(400);

            // restore the first admin for the tests that follow
            expect(
                (await patch(secondSession, admin.id, { isActive: true })).statusCode
            ).toBe(200);
            admin = await loginUser(ctx.app, 'admin@example.com');
        });

        it('lets a disabled admin be demoted, since they could not sign in anyway', async () => {
            // created with the current admin's own session: the shared helper's
            // cookie belongs to the first admin, whose sessions were ended above
            const created = await ctx.app.inject({
                method: 'POST',
                url: '/admin/users',
                headers: as(admin),
                payload: {
                    email: 'spare-admin@example.com',
                    password: 'password123',
                    isAdmin: true,
                },
            });
            const spareId = created.json().id;
            await patch(admin, spareId, { isActive: false });
            const res = await patch(admin, spareId, { isAdmin: false });
            expect(res.statusCode).toBe(200);
        });
    });

    describe('audit trail', () => {
        it('records who disabled and who enabled an account', async () => {
            const rows = await ctx.db.select().from(auditLog);
            const actions = rows.map((r) => r.action);
            expect(actions).toContain('user.disable');
            expect(actions).toContain('user.enable');
            const disable = rows.find((r) => r.action === 'user.disable');
            expect(disable?.userId).toBe(admin.id);
        });

        it('logs a plain edit as an update, not as a status change', async () => {
            const before = (await ctx.db.select().from(auditLog)).length;
            // already active: nothing about the status changes
            expect((await patch(admin, other.id, { isActive: true })).statusCode).toBe(
                200
            );
            const rows = await ctx.db.select().from(auditLog);
            expect(rows.length).toBe(before + 1);
            expect(rows.at(-1)?.action).toBe('user.update');
        });
    });
});
