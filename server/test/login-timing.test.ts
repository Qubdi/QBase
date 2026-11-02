import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const verifyCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('@node-rs/argon2', async (importOriginal) => {
    const real = await importOriginal<typeof import('@node-rs/argon2')>();
    return {
        ...real,
        verify: (...args: Parameters<typeof real.verify>) => {
            verifyCalls.n++;
            return real.verify(...args);
        },
    };
});

import { createTestApp, registerUser, type TestCtx } from './helpers.js';

describe('sign-in work does not depend on the email existing', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
        await registerUser(ctx.app, 'real@example.com');
    });
    afterAll(() => ctx.close());

    const login = async (email: string) => {
        const before = verifyCalls.n;
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email, password: 'wrong-password' },
        });
        return { status: res.statusCode, hashChecks: verifyCalls.n - before };
    };

    it('runs one password check for a known and for an unknown email', async () => {
        const known = await login('real@example.com');
        const unknown = await login('nobody@example.com');
        expect(known).toEqual({ status: 401, hashChecks: 1 });
        expect(unknown).toEqual({ status: 401, hashChecks: 1 });
    });
});
