import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, sessions, users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
} from './helpers.js';

describe('auth', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(() => ctx.close());

    it('makes the first registered user an admin and the second not', async () => {
        const first = await registerUser(ctx.app, 'a@example.com');
        const second = await registerUser(ctx.app, 'b@example.com');
        const me1 = await ctx.app.inject({
            url: '/auth/me',
            headers: as(first),
        });
        const me2 = await ctx.app.inject({
            url: '/auth/me',
            headers: as(second),
        });
        expect(me1.json().isAdmin).toBe(true);
        expect(me2.json().isAdmin).toBe(false);
    });

    it('rejects duplicate emails and weak passwords', async () => {
        const admin = await loginUser(ctx.app, 'a@example.com');
        await registerUser(ctx.app, 'dup@example.com');
        const dup = await ctx.app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: as(admin),
            payload: { email: 'DUP@example.com', password: 'password123' },
        });
        expect(dup.statusCode).toBe(409);
        const weak = await ctx.app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: as(admin),
            payload: { email: 'weak@example.com', password: 'short' },
        });
        expect(weak.statusCode).toBe(400);
    });

    it('sets an httpOnly SameSite=Lax cookie and stores only a hash', async () => {
        await registerUser(ctx.app, 'cookie@example.com');
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'cookie@example.com', password: 'password123' },
        });
        const c = res.cookies.find((x) => x.name === 'qubdidb_session')!;
        expect(c.httpOnly).toBe(true);
        expect(String(c.sameSite).toLowerCase()).toBe('lax');
        const rows = await ctx.db.select().from(sessions);
        expect(rows.some((r) => r.id === c.value)).toBe(false);
    });

    it('does not store the password in plain text', async () => {
        await registerUser(ctx.app, 'hash@example.com', 'password123');
        const rows = await ctx.db.select().from(users);
        for (const r of rows) {
            expect(r.passwordHash).toMatch(/^\$argon2/);
        }
    });

    it('logs in, rejects bad credentials, and logs out', async () => {
        await registerUser(ctx.app, 'login@example.com');
        const bad = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'login@example.com', password: 'wrongpassword' },
        });
        expect(bad.statusCode).toBe(401);
        const unknown = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'nobody@example.com', password: 'password123' },
        });
        expect(unknown.statusCode).toBe(401);

        const ok = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'login@example.com', password: 'password123' },
        });
        expect(ok.statusCode).toBe(200);
        const cookie = `qubdidb_session=${
            ok.cookies.find((x) => x.name === 'qubdidb_session')!.value
        }`;
        expect(
            (await ctx.app.inject({ url: '/auth/me', headers: { cookie } }))
                .statusCode
        ).toBe(200);
        await ctx.app.inject({
            method: 'POST',
            url: '/auth/logout',
            headers: { cookie },
        });
        expect(
            (await ctx.app.inject({ url: '/auth/me', headers: { cookie } }))
                .statusCode
        ).toBe(401);
    });

    it('returns 401 from /auth/me without a session', async () => {
        const res = await ctx.app.inject({ url: '/auth/me' });
        expect(res.statusCode).toBe(401);
    });

    it('changes the password and ends any other session', async () => {
        const user = await registerUser(ctx.app, 'pw@example.com');
        // signing in leaves one session per account, so plant one that predates that
        await ctx.db.insert(sessions).values({
            id: createHash('sha256').update('older-session').digest('hex'),
            userId: user.id,
            expiresAt: new Date(Date.now() + 3_600_000),
        });
        const otherCookie = 'qubdidb_session=older-session';

        const wrong = await ctx.app.inject({
            method: 'POST',
            url: '/auth/change-password',
            headers: as(user),
            payload: { currentPassword: 'nope-nope', newPassword: 'newpassword1' },
        });
        expect(wrong.statusCode).toBe(403);

        const ok = await ctx.app.inject({
            method: 'POST',
            url: '/auth/change-password',
            headers: as(user),
            payload: {
                currentPassword: 'password123',
                newPassword: 'newpassword1',
            },
        });
        expect(ok.statusCode).toBe(200);
        expect(
            (await ctx.app.inject({ url: '/auth/me', headers: as(user) }))
                .statusCode
        ).toBe(200);
        expect(
            (
                await ctx.app.inject({
                    url: '/auth/me',
                    headers: { cookie: otherCookie },
                })
            ).statusCode
        ).toBe(401);
        const login = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'pw@example.com', password: 'newpassword1' },
        });
        expect(login.statusCode).toBe(200);
    });

    it('requires login to change password', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/change-password',
            payload: { currentPassword: 'x', newPassword: 'newpassword1' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('writes audit rows for self-registration and admin-created users', async () => {
        const [first] = await ctx.db.select().from(users).limit(1);
        await registerUser(ctx.app, 'audit@example.com');
        const rows = await ctx.db.select().from(auditLog);
        expect(rows.some((r) => r.action === 'user.register')).toBe(true);
        expect(
            rows.some((r) => r.userId === first.id && r.action === 'user.create')
        ).toBe(true);
    });
});

describe('closed signup', () => {
    it('lets only the very first account self-register', async () => {
        const ctx = await createTestApp();
        try {
            const before = await ctx.app.inject({ url: '/auth/setup-status' });
            expect(before.json().needsSetup).toBe(true);
            await registerUser(ctx.app, 'first@example.com');
            const after = await ctx.app.inject({ url: '/auth/setup-status' });
            expect(after.json().needsSetup).toBe(false);
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: { email: 'second@example.com', password: 'password123' },
            });
            expect(res.statusCode).toBe(403);
        } finally {
            await ctx.close();
        }
    });
});
