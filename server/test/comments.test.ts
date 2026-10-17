import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comments } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    projectFor,
    registerUser,
    type TestCtx,
    withBase,
    type TestUser,
    grant,
} from './helpers.js';

const table = (id: string, fieldIds: string[] = []) => ({
    id,
    name: id,
    x: 0,
    y: 0,
    fields: fieldIds.map((f) => ({ id: f, name: f })),
});
const content = (tables: ReturnType<typeof table>[], rels: string[] = []) => ({
    id: 'x',
    name: 'Shop',
    databaseType: 'postgresql',
    tables,
    relationships: rels.map((id) => ({
        id,
        sourceTableId: 't1',
        targetTableId: 't2',
    })),
});

describe('comments', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;
    let token: string;

    const setContent = async (c: object, title = 'Shop') =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: await withBase(ctx.app, owner, id, { title, content: c }),
        });
    const publish = async () =>
        (
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/publish`,
                headers: as(owner),
                payload: {},
            })
        ).json().version as number;
    // The editor has no way to write comments any more: rows are inserted
    // directly, as old data would be.
    const add = async (targetType: 'table' | 'field' | 'relationship', targetId: string, body = 'note') =>
        (
            await ctx.db
                .insert(comments)
                .values({ diagramId: id, targetType, targetId, body, authorId: owner.id })
                .returning()
        )[0];
    const editorList = async () =>
        ctx.db.select().from(comments).where(eq(comments.diagramId, id));
    const publicView = () =>
        ctx.app.inject({ url: `/s/${token}/comments` });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        const created = await ctx.app.inject({
            method: 'POST',
            url: '/diagrams',
            headers: as(owner),
            payload: {
                projectId: await projectFor(ctx.app),
                title: 'Shop',
                content: content([table('t1', ['f1']), table('t2', ['f2'])], ['r1']),
            },
        });
        id = created.json().id;
        for (const [u, role] of [
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            await grant(ctx.app, u, role);
        }
        const link = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/share-links`,
            headers: as(owner),
            payload: {},
        });
        token = link.json().token;
    });
    afterAll(() => ctx.close());

    describe('the editor routes are gone', () => {
        it('no longer serves or accepts comments on a diagram', async () => {
            for (const [method, url] of [
                ['GET', `/diagrams/${id}/comments`],
                ['POST', `/diagrams/${id}/comments`],
                ['PUT', `/diagrams/${id}/comments/${id}`],
                ['POST', `/diagrams/${id}/comments/${id}/resolve`],
                ['DELETE', `/diagrams/${id}/comments/${id}`],
            ] as const) {
                const res = await ctx.app.inject({
                    method,
                    url,
                    headers: as(owner),
                    payload: { targetType: 'table', targetId: 't1', body: 'x' },
                });
                expect(res.statusCode, `${method} ${url}`).toBe(404);
            }
            expect(await editorList()).toHaveLength(0);
        });
    });

    describe('snapshots, carry-forward and orphans', () => {
        let commentId: string;

        it('keeps comments out of the published view until they are carried', async () => {
            expect((await publicView()).statusCode).toBe(404); // nothing published
            commentId = (await add('table', 't1', 'carry me')).id;
        });

        it('carries comments to the first published version', async () => {
            const v = await publish();
            expect(v).toBe(1);
            const mine = (await editorList()).find((c) => c.id === commentId)!;
            expect(mine.snapshotVersion).toBe(1);
            const pub = (await publicView()).json();
            expect(pub.version).toBe(1);
            expect(pub.comments.some((c: { id: string }) => c.id === commentId)).toBe(true);
        });

        it('hides comments on unpublished targets until the next publish', async () => {
            await setContent(
                content(
                    [table('t1', ['f1']), table('t2', ['f2']), table('t9')],
                    ['r1']
                )
            );
            const fresh = (await add('table', 't9', 'brand new')).id;
            const before = (await publicView()).json();
            expect(before.comments.some((c: { id: string }) => c.id === fresh)).toBe(false);

            expect(await publish()).toBe(2);
            const after = (await publicView()).json();
            expect(after.version).toBe(2);
            expect(after.comments.some((c: { id: string }) => c.id === fresh)).toBe(true);
            expect(after.comments.some((c: { id: string }) => c.id === commentId)).toBe(true);
        });

        it('flags comments orphaned when their target disappears, without deleting them', async () => {
            await setContent(content([table('t2', ['f2']), table('t9')], []));
            expect(await publish()).toBe(3);

            const row = (await editorList()).find((c) => c.id === commentId)!;
            expect(row.orphaned).toBe(true);
            expect(row.snapshotVersion).toBe(2); // left behind at the last version it lived in
            const pub = (await publicView()).json();
            expect(pub.version).toBe(3);
            expect(pub.comments.some((c: { id: string }) => c.id === commentId)).toBe(false);
        });

        it('un-orphans a comment when its target comes back', async () => {
            await setContent(
                content([table('t1', ['f1']), table('t2', ['f2']), table('t9')], ['r1'])
            );
            expect(await publish()).toBe(4);
            const row = (await editorList()).find((c) => c.id === commentId)!;
            expect(row.orphaned).toBe(false);
            expect(row.snapshotVersion).toBe(4);
            const pub = (await publicView()).json();
            expect(pub.comments.some((c: { id: string }) => c.id === commentId)).toBe(true);
        });

        it('keeps comments through republishing identical content', async () => {
            const before = (await editorList()).length;
            await publish();
            expect((await editorList()).length).toBe(before);
            const pub = (await publicView()).json();
            expect(pub.comments.length).toBeGreaterThan(0);
        });

        it('keeps resolved state across publishes', async () => {
            const target = (await add('table', 't2', 'resolved one')).id;
            await ctx.db
                .update(comments)
                .set({ resolved: true })
                .where(eq(comments.id, target));
            await publish();
            expect((await editorList()).find((c) => c.id === target)!.resolved).toBe(true);
            const pub = (await publicView()).json();
            expect(pub.comments.find((c: { id: string }) => c.id === target).resolved).toBe(true);
        });
    });

    describe('reading', () => {
        it('serves the public view without exposing author identity', async () => {
            const res = await publicView();
            expect(res.statusCode).toBe(200);
            expect(res.body).not.toContain('@example.com');
            expect(res.body).not.toContain('authorEmail');
            expect(res.body).not.toContain('orphaned');
        });

        it('404s on revoked, expired-style and malformed tokens', async () => {
            expect(
                (await ctx.app.inject({ url: `/s/${'A'.repeat(22)}/comments` })).statusCode
            ).toBe(404);
            expect((await ctx.app.inject({ url: '/s/nope/comments' })).statusCode).toBe(404);
            const made = (
                await ctx.app.inject({
                    method: 'POST',
                    url: `/diagrams/${id}/share-links`,
                    headers: as(owner),
                    payload: {},
                })
            ).json();
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${id}/share-links/${made.id}`,
                headers: as(owner),
            });
            expect(
                (await ctx.app.inject({ url: `/s/${made.token}/comments` })).statusCode
            ).toBe(404);
        });

        it('asks for sign-in on signed_in links', async () => {
            const made = (
                await ctx.app.inject({
                    method: 'POST',
                    url: `/diagrams/${id}/share-links`,
                    headers: as(owner),
                    payload: { access: 'signed_in' },
                })
            ).json();
            expect(
                (await ctx.app.inject({ url: `/s/${made.token}/comments` })).statusCode
            ).toBe(401);
            expect(
                (
                    await ctx.app.inject({
                        url: `/s/${made.token}/comments`,
                        headers: as(stranger),
                    })
                ).statusCode
            ).toBe(200);
        });
    });

    describe('share tokens are read-only', () => {
        it('rejects every write with 403 and changes nothing', async () => {
            const before = await ctx.db.select().from(comments).where(eq(comments.diagramId, id));
            const anyComment = before[0].id;
            for (const [method, path] of [
                ['POST', `/s/${token}/comments`],
                ['PUT', `/s/${token}/comments/${anyComment}`],
                ['PATCH', `/s/${token}/comments/${anyComment}`],
                ['DELETE', `/s/${token}/comments/${anyComment}`],
                ['POST', `/s/${token}/comments/${anyComment}/resolve`],
            ] as const) {
                const res = await ctx.app.inject({
                    method,
                    url: path,
                    payload: { targetType: 'table', targetId: 't1', body: 'hacked', resolved: true },
                });
                expect(res.statusCode, `${method} ${path}`).toBe(403);
                expect(res.json().error).toBe('read_only');
            }
            const after = await ctx.db.select().from(comments).where(eq(comments.diagramId, id));
            expect(after).toEqual(before);
        });

        it('still 404s for unknown tokens so they reveal nothing', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: `/s/${'Z'.repeat(22)}/comments`,
                payload: { targetType: 'table', targetId: 't1', body: 'x' },
            });
            expect(res.statusCode).toBe(404);
        });

        it('ignores a logged-in editor session when the write goes through a token', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: `/s/${token}/comments`,
                headers: as(owner),
                payload: { targetType: 'table', targetId: 't1', body: 'sneaky' },
            });
            expect(res.statusCode).toBe(403);
        });
    });

    it('removes comments together with the diagram', async () => {
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}`,
            headers: as(owner),
        });
        const left = await ctx.db.select().from(comments).where(eq(comments.diagramId, id));
        expect(left).toHaveLength(0);
    });
});
