import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const hashed = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/auth/password.js', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/auth/password.js')>();
    return {
        ...real,
        hashPassword: (password: string) => {
            hashed.count++;
            return real.hashPassword(password);
        },
    };
});

const { createTestApp, registerUser } = await import('./helpers.js');
type TestCtx = Awaited<ReturnType<typeof createTestApp>>;

describe('sign-up once it is closed', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
        await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    it('refuses with 403 without hashing the password', async () => {
        const before = hashed.count;
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/register',
            payload: { email: 'late@example.com', password: 'Password-123!-long' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('signup_disabled');
        expect(hashed.count).toBe(before);
    });
});
