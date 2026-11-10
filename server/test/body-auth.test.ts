import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestCtx } from './helpers.js';

// The session is checked before the body is read: someone with no session
// cannot make the server buffer and parse a diagram-sized body.
describe('a diagram body from someone who is not signed in', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp({ bodyLimit: 2 * 1024, diagramBodyLimit: 64 * 1024 });
    });
    afterAll(() => ctx.close());

    it('is answered 401 even when the body is not valid JSON', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: { 'content-type': 'application/json' },
            payload: '{ this is not json',
        });
        expect(res.statusCode).toBe(401);
    });

    it('is answered 401, not 413, when the body is over the limit', async () => {
        const res = await ctx.app.inject({
            method: 'PUT',
            url: '/diagrams/00000000-0000-0000-0000-000000000000',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ pad: 'a'.repeat(200 * 1024) }),
        });
        expect(res.statusCode).toBe(401);
    });

    it('does not inflate a gzip body', async () => {
        const res = await ctx.app.inject({
            method: 'PUT',
            url: '/diagrams/00000000-0000-0000-0000-000000000000',
            headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
            payload: Buffer.from('not gzip at all'),
        });
        expect(res.statusCode).toBe(401);
    });

    it('with a made-up cookie is also answered 401 before the body', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: { 'content-type': 'application/json', cookie: 'qbase_session=junk' },
            payload: '{ nope',
        });
        expect(res.statusCode).toBe(401);
    });
});
