import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exceedsDepth } from '../src/lib/depth.js';
import { as, createDiagram, createTestApp, projectFor, registerUser, type TestCtx, type TestUser } from './helpers.js';

const nested = (depth: number) => {
    let value: unknown = 'leaf';
    for (let i = 0; i < depth; i++) value = [value];
    return value;
};

describe('exceedsDepth', () => {
    it('counts levels of objects and arrays, not their size', () => {
        expect(exceedsDepth('x', 3)).toBe(false);
        expect(exceedsDepth({ a: [1, 2, { b: 3 }] }, 3)).toBe(false);
        expect(exceedsDepth({ a: [1, 2, { b: 3 }] }, 2)).toBe(true);
        expect(exceedsDepth(Array.from({ length: 1000 }, () => 1), 1)).toBe(false);
    });

    it('handles a depth that would overflow recursion', () => {
        expect(exceedsDepth(nested(200_000), 100)).toBe(true);
    });
});

/** The request body as text: stringifying a structure this deep would itself overflow. */
const deepBody = (extra: string) =>
    `{${extra}"content":{"tables":[${'['.repeat(5000)}"x"${']'.repeat(5000)}]}}`;
const json = { 'content-type': 'application/json' };

describe('a diagram nested far too deep', () => {
    let ctx: TestCtx;
    let user: TestUser;
    beforeAll(async () => {
        ctx = await createTestApp();
        user = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    it('is refused with 400 on create, not 500', async () => {
        const projectId = await projectFor(ctx.app);
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: { ...as(user), ...json },
            payload: deepBody(`"title":"Deep","projectId":"${projectId}",`),
        });
        expect(res.statusCode).toBe(400);
    });

    it('is refused with 400 on update', async () => {
        const id = await createDiagram(ctx.app, user, 'Fine');
        const res = await ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: { ...as(user), ...json },
            payload: deepBody(`"baseUpdatedAt":"${new Date().toISOString()}",`),
        });
        expect(res.statusCode).toBe(400);
    });
});
