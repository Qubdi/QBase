import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLISH_RATE_LIMIT } from '../src/diagrams/routes.js';
import { as, createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('publishing a version', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let other: TestUser;
    let id: string;
    let otherId: string;
    const publish = (user: TestUser, diagram: string) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagram}/publish`,
            headers: { ...as(user), 'content-type': 'application/json' },
            payload: {},
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'pub-a@example.com');
        other = await registerUser(ctx.app, 'pub-b@example.com');
        id = await createDiagram(ctx.app, owner);
        otherId = await createDiagram(ctx.app, other);
    });
    afterAll(() => ctx.close());

    it('is held to a few a minute for each user, and one user does not use up another’s', async () => {
        for (let n = 0; n < PUBLISH_RATE_LIMIT; n++) {
            expect((await publish(owner, id)).statusCode).toBe(201);
        }
        const over = await publish(owner, id);
        expect(over.statusCode).toBe(429);
        expect(over.headers['retry-after']).toBeDefined();
        expect((await publish(other, otherId)).statusCode).toBe(201);
    });

    it('turns away someone who is not signed in before it counts anything', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: {},
        });
        expect(res.statusCode).toBe(401);
    });
});
