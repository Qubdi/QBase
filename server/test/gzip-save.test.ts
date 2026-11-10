import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

// A browser cap on a request sent as the page closes is 64 KiB, so the editor
// gzips a larger final save. The server inflates it, up to the diagram limit.
describe('a gzipped diagram save', () => {
    const LIMIT = 64 * 1024;
    let ctx: TestCtx;
    let owner: TestUser;
    let id: string;

    const current = async (): Promise<string> =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(owner),
            })
        ).json().updatedAt;

    const put = (body: Buffer, encoding: string | null = 'gzip') =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: {
                ...as(owner),
                'content-type': 'application/json',
                ...(encoding ? { 'content-encoding': encoding } : {}),
            },
            payload: body,
        });
    const json = async (content: object) =>
        Buffer.from(
            JSON.stringify({ content, baseUpdatedAt: await current() })
        );

    beforeAll(async () => {
        ctx = await createTestApp({ bodyLimit: 2 * 1024, diagramBodyLimit: LIMIT });
        owner = await registerUser(ctx.app, 'gz@example.com');
        id = await createDiagram(ctx.app, owner);
    });
    afterAll(() => ctx.close());

    it('is inflated and saved like any other body', async () => {
        const content = { ...sampleContent, note: 'a'.repeat(40 * 1024) };
        const res = await put(gzipSync(await json(content)));
        expect(res.statusCode).toBe(200);
        const read = await ctx.app.inject({
            url: `/diagrams/${id}`,
            headers: as(owner),
        });
        expect(read.json().content.note).toHaveLength(40 * 1024);
    });

    it('refuses a small file that inflates past the limit', async () => {
        // 2 MiB of one letter gzips to a couple of kilobytes
        const bomb = gzipSync(await json({ ...sampleContent, note: 'a'.repeat(2 * 1024 * 1024) }));
        expect(bomb.length).toBeLessThan(LIMIT);
        const res = await put(bomb);
        expect(res.statusCode).toBe(413);
    });

    it('refuses a body that is not gzip', async () => {
        const res = await put(await json(sampleContent));
        expect(res.statusCode).toBe(400);
    });

    it('refuses a gzip body that is cut short', async () => {
        const whole = gzipSync(await json(sampleContent));
        const res = await put(whole.subarray(0, whole.length - 8));
        expect(res.statusCode).toBe(400);
    });

    it('refuses an encoding it does not know', async () => {
        const res = await put(await json(sampleContent), 'br');
        expect(res.statusCode).toBe(415);
    });

    it('leaves a plain body alone', async () => {
        const res = await put(await json({ ...sampleContent, name: 'plain' }), null);
        expect(res.statusCode).toBe(200);
        expect(res.json().id).toBe(id);
    });

    it('still holds a plain body to the limit', async () => {
        const res = await put(
            Buffer.from(
                JSON.stringify({
                    content: { ...sampleContent, note: 'a'.repeat(LIMIT * 2) },
                    baseUpdatedAt: await current(),
                })
            ),
            null
        );
        expect(res.statusCode).toBe(413);
    });
});
