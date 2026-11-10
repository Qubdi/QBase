import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashPassword } from '../src/auth/password.js';
import { users } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    loginUser,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const GOOD = 'Correct-Horse-9';
const OLD_WEAK = 'password123'; // allowed before the rules existed

describe('password rules', () => {
    let ctx: TestCtx;
    let admin: TestUser;

    const create = (email: string, password: string) =>
        ctx.app.inject({
            method: 'POST',
            url: '/admin/users',
            headers: as(admin),
            payload: { email, password },
        });
    const reset = (id: string, password: string) =>
        ctx.app.inject({
            method: 'PATCH',
            url: `/admin/users/${id}`,
            headers: as(admin),
            payload: { password },
        });
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

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com', GOOD);
    });
    afterAll(() => ctx.close());

    describe('admin creates a user', () => {
        it('refuses a weak password with the list of rules', async () => {
            const res = await create('weak@example.com', 'password123');
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'weak_password',
                rules: ['min_length', 'uppercase', 'symbol'],
            });
        });

        it('never echoes the password back', async () => {
            const res = await create('echo@example.com', 'password123');
            expect(res.body).not.toContain('password123');
        });

        it('accepts one that meets every rule', async () => {
            expect((await create('ok@example.com', GOOD)).statusCode).toBe(201);
        });
    });

    describe('admin resets a password', () => {
        let target: TestUser;
        beforeAll(async () => {
            target = await registerUser(ctx.app, 'reset-me@example.com', GOOD);
        });

        it('refuses a weak one and keeps the old password', async () => {
            const res = await reset(target.id, 'weakweakweak');
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('weak_password');
            await expect(
                loginUser(ctx.app, 'reset-me@example.com', GOOD)
            ).resolves.toBeTruthy();
        });

        it("refuses one that contains the account's own email name", async () => {
            const res = await reset(target.id, 'My-Reset-Me-99!');
            expect(res.statusCode).toBe(400);
            expect(res.json().rules).toEqual(['email']);
        });

        it('accepts a good one, which then signs in', async () => {
            expect((await reset(target.id, 'Brand-New-Pw-7?')).statusCode).toBe(
                200
            );
            await expect(
                loginUser(ctx.app, 'reset-me@example.com', 'Brand-New-Pw-7?')
            ).resolves.toBeTruthy();
        });

        it('answers 404 for an account that does not exist', async () => {
            const res = await reset(
                '00000000-0000-4000-8000-000000000000',
                'Brand-New-Pw-7?'
            );
            expect(res.statusCode).toBe(404);
        });

        it('still lets an admin change only the role of someone with an old weak password', async () => {
            const res = await ctx.app.inject({
                method: 'PATCH',
                url: `/admin/users/${target.id}`,
                headers: as(admin),
                payload: { isAdmin: false },
            });
            expect(res.statusCode).toBe(200);
        });
    });

    describe('change password', () => {
        let user: TestUser;
        beforeAll(async () => {
            user = await registerUser(ctx.app, 'changer@example.com', GOOD);
        });

        it('refuses a weak new password and lists what is missing', async () => {
            const res = await change(user, GOOD, 'alllowercase');
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'weak_password',
                rules: ['uppercase', 'number', 'symbol'],
            });
        });

        it('refuses the same password again', async () => {
            const res = await change(user, GOOD, GOOD);
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: 'same_password' });
        });

        it('says nothing about the new one when the current one is wrong', async () => {
            const res = await change(user, 'not-the-password', 'weak');
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'wrong_password' });
        });

        it('accepts a good one', async () => {
            const res = await change(user, GOOD, 'Another-Good-Pw-3#');
            expect(res.statusCode).toBe(200);
        });
    });

    describe('sign-in does not apply the rules', () => {
        it('lets someone with an old weak password in', async () => {
            await ctx.db.insert(users).values({
                email: 'veteran@example.com',
                passwordHash: await hashPassword(OLD_WEAK),
            });
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'veteran@example.com', password: OLD_WEAK },
            });
            expect(res.statusCode).toBe(200);
        });

        it('answers a wrong short password as invalid credentials, not as a validation error', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'veteran@example.com', password: 'x' },
            });
            expect(res.statusCode).toBe(401);
        });

        it('still refuses an empty password', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'veteran@example.com', password: '' },
            });
            expect(res.statusCode).toBe(400);
        });
    });
});

// these start from an empty database (createTestApp truncates it), so they stay apart from the
// suite above, which needs its admin to survive
describe('first-admin sign-up', () => {
    it('refuses a weak password and lists what is missing', async () => {
        const fresh = await createTestApp();
        try {
            const res = await fresh.app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: { email: 'first@example.com', password: 'short' },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({
                error: 'weak_password',
                rules: ['min_length', 'uppercase', 'number', 'symbol'],
            });
            // nothing was created
            expect(await fresh.db.select().from(users)).toHaveLength(0);
        } finally {
            await fresh.close();
        }
    });

    it('refuses a password built from the email', async () => {
        const fresh = await createTestApp();
        try {
            const res = await fresh.app.inject({
                method: 'POST',
                url: '/auth/register',
                payload: {
                    email: 'founder@example.com',
                    password: 'Founder-2024!',
                },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().rules).toEqual(['email']);
        } finally {
            await fresh.close();
        }
    });
});

describe('PASSWORD_MIN_LENGTH', () => {
    const env = (extra: NodeJS.ProcessEnv = {}) => ({
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        ...extra,
    });

    it('defaults to 12', () => {
        expect(loadConfig(env()).passwordMinLength).toBe(12);
    });

    it('can be raised, and never goes below 8', () => {
        expect(
            loadConfig(env({ PASSWORD_MIN_LENGTH: '16' })).passwordMinLength
        ).toBe(16);
        expect(
            loadConfig(env({ PASSWORD_MIN_LENGTH: '3' })).passwordMinLength
        ).toBe(8);
    });

    it('is refused at boot when it is not a number', () => {
        expect(() => loadConfig(env({ PASSWORD_MIN_LENGTH: 'abc' }))).toThrow(
            /PASSWORD_MIN_LENGTH/
        );
    });

    it('is the length the server enforces', async () => {
        const ctx = await createTestApp({ passwordMinLength: 16 });
        try {
            const adminUser = await registerUser(
                ctx.app,
                'a@example.com',
                'Sixteen-Chars-1!'
            );
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/admin/users',
                headers: as(adminUser),
                payload: { email: 'b@example.com', password: GOOD }, // 15
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().rules).toEqual(['min_length']);
        } finally {
            await ctx.close();
        }
    });
});

describe('setup-status', () => {
    it('tells the form the minimum length, before anyone has signed in', async () => {
        const ctx = await createTestApp({ passwordMinLength: 14 });
        try {
            const res = await ctx.app.inject({ url: '/auth/setup-status' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({
                needsSetup: true,
                setupTokenRequired: false,
                passwordMinLength: 14,
                mfaAvailable: false,
            });
        } finally {
            await ctx.close();
        }
    });
});
