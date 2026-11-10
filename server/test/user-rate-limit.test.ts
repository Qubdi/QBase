import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USER_RATE_LIMIT } from '../src/app.js';
import { as, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('the all-routes allowance per user', () => {
    let ctx: TestCtx;
    let busy: TestUser;
    let calm: TestUser;

    beforeAll(async () => {
        ctx = await createTestApp({}, undefined, true, 5);
        // the first account is the admin, who creates the second: both are set
        // up before any test spends an allowance
        busy = await registerUser(ctx.app, 'busy@example.com');
        calm = await registerUser(ctx.app, 'calm@example.com');
    });
    afterAll(() => ctx.close());

    const me = (headers: Record<string, string>) =>
        ctx.app.inject({ url: '/auth/me', headers });

    it('is generous by default', () => {
        expect(USER_RATE_LIMIT).toBeGreaterThanOrEqual(300);
    });

    it('holds back a signed-in user who goes over it, and tells them when to retry', async () => {
        const codes: number[] = [];
        let last;
        for (let i = 0; i < 8; i++) {
            last = await me(as(busy));
            codes.push(last.statusCode);
        }
        const first429 = codes.indexOf(429);
        expect(first429).toBeGreaterThan(0);
        expect(first429).toBeLessThanOrEqual(5);
        // once held back, every call in the window is
        expect(codes.slice(first429).every((c) => c === 429)).toBe(true);
        expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('counts each user on their own', async () => {
        expect((await me(as(calm))).statusCode).toBe(200);
    });

    it('does not count calls that carry no session, however many', async () => {
        for (let i = 0; i < 20; i++) {
            expect((await ctx.app.inject({ url: '/auth/setup-status' })).statusCode).toBe(200);
        }
        for (let i = 0; i < 20; i++) {
            const res = await me({ cookie: `qbase_session=junk-${i}` });
            expect(res.statusCode).toBe(401);
        }
    });
});
