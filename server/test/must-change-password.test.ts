import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const TEMP = 'Temp-Pass-123!';
const OWN = 'My-Own-Pass-456!';

describe('must change password', () => {
    let ctx: TestCtx;
    let admin: TestUser;

    const flagOf = async (id: string) =>
        (
            await ctx.db
                .select({ f: users.mustChangePassword })
                .from(users)
                .where(eq(users.id, id))
        )[0].f;
    const get = (url: string, who: TestUser) =>
        ctx.app.inject({ url, headers: as(who) });
    const change = (
        who: TestUser,
        currentPassword: string,
        newPassword: string
    ) =>
        ctx.app.inject({
            method: 'POST',
            url: '/auth/change-password',
            headers: as(who),
            payload: { currentPassword, newPassword },
        });
    const resetByAdmin = (id: string, password: string) =>
        ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${id}`,
            headers: as(admin),
            payload: { password },
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(
            ctx.app,
            'admin@example.com',
            'Boss-Pass-123!'
        );
    });
    afterAll(() => ctx.close());

    it('does not flag the first admin, who chose their own password', async () => {
        expect(await flagOf(admin.id)).toBe(false);
        const me = await get('/auth/me', admin);
        expect(me.json().mustChangePassword).toBe(false);
    });

    describe('an account an admin created', () => {
        let ann: TestUser;
        beforeAll(async () => {
            ann = await registerUser(ctx.app, 'ann@example.com', TEMP, {
                temporary: true,
            });
        });

        it('starts with the flag set, and says so at sign-in and in me', async () => {
            expect(await flagOf(ann.id)).toBe(true);
            const login = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'ann@example.com', password: TEMP },
            });
            expect(login.json().mustChangePassword).toBe(true);
            ann = await loginUser(ctx.app, 'ann@example.com', TEMP);
            const me = await get('/auth/me', ann);
            expect(me.statusCode).toBe(200);
            expect(me.json().mustChangePassword).toBe(true);
        });

        it('may not use anything else until the password is changed', async () => {
            for (const url of ['/projects', '/diagrams', '/admin/users']) {
                const res = await get(url, ann);
                expect(res.statusCode, url).toBe(403);
                expect(res.json(), url).toEqual({
                    error: 'password_change_required',
                });
            }
        });

        it('may still check the server and sign out', async () => {
            expect((await ctx.app.inject({ url: '/health' })).statusCode).toBe(
                200
            );
            const other = await registerUser(ctx.app, 'out@example.com', TEMP, {
                temporary: true,
            });
            const out = await ctx.app.inject({
                method: 'POST',
                url: '/auth/logout',
                headers: as(other),
            });
            expect(out.statusCode).toBe(200);
        });

        it('still gets the rules when the new password is weak, and stays flagged', async () => {
            const res = await change(ann, TEMP, 'weak');
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('weak_password');
            expect(await flagOf(ann.id)).toBe(true);
        });

        it('cannot keep the temporary password as their own', async () => {
            const res = await change(ann, TEMP, TEMP);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'same_password' });
            expect(await flagOf(ann.id)).toBe(true);
        });

        it('is let in once they set their own password', async () => {
            const res = await change(ann, TEMP, OWN);
            expect(res.statusCode).toBe(200);
            expect(await flagOf(ann.id)).toBe(false);
            expect((await get('/projects', ann)).statusCode).toBe(200);
            expect((await get('/auth/me', ann)).json().mustChangePassword).toBe(
                false
            );
        });

        it('is not asked again at the next sign-in', async () => {
            const login = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'ann@example.com', password: OWN },
            });
            expect(login.json().mustChangePassword).toBe(false);
        });
    });

    describe('an admin resetting a password', () => {
        let bob: TestUser;
        beforeAll(async () => {
            bob = await registerUser(ctx.app, 'bob@example.com', TEMP, {
                temporary: true,
            });
            bob = await loginUser(ctx.app, 'bob@example.com', TEMP);
            expect((await change(bob, TEMP, OWN)).statusCode).toBe(200);
            expect(await flagOf(bob.id)).toBe(false);
        });

        it('makes the new password temporary again', async () => {
            expect(
                (await resetByAdmin(bob.id, 'Reset-Pass-789!')).statusCode
            ).toBe(200);
            expect(await flagOf(bob.id)).toBe(true);
            bob = await loginUser(
                ctx.app,
                'bob@example.com',
                'Reset-Pass-789!'
            );
            expect((await get('/projects', bob)).statusCode).toBe(403);
        });

        it('does not flag an admin who sets their own password', async () => {
            const res = await resetByAdmin(admin.id, 'Boss-New-Pass-1!');
            expect(res.statusCode).toBe(200);
            expect(await flagOf(admin.id)).toBe(false);
            // the reset ended the admin's own session; sign in again
            admin = await loginUser(
                ctx.app,
                'admin@example.com',
                'Boss-New-Pass-1!'
            );
            expect((await get('/admin/users', admin)).statusCode).toBe(200);
        });

        it('does not change the flag when only the role changes', async () => {
            const carol = await registerUser(
                ctx.app,
                'carol@example.com',
                TEMP,
                { temporary: true }
            );
            expect(await flagOf(carol.id)).toBe(true);
            const res = await ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${carol.id}`,
                headers: as(admin),
                payload: { isAdmin: false },
            });
            expect(res.statusCode).toBe(200);
            expect(await flagOf(carol.id)).toBe(true);
        });
    });

    it('never shows a hash or a password in me', async () => {
        const me = await get('/auth/me', admin);
        expect(Object.keys(me.json()).sort()).toEqual([
            'email',
            'id',
            'isAdmin',
            'mfaEnabled',
            'mustChangePassword',
        ]);
    });

    it('does not block the ordinary users who have no flag', async () => {
        const dan = await registerUser(ctx.app, 'dan@example.com', TEMP, {
            temporary: true,
        });
        const dan2 = await loginUser(ctx.app, 'dan@example.com', TEMP);
        expect((await change(dan2, TEMP, OWN)).statusCode).toBe(200);
        expect((await get('/diagrams', dan2)).statusCode).toBe(200);
        expect(dan.id).toBe(dan2.id);
    });
});
