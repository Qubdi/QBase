import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, comments } from '../src/db/schema.js';
import {
    as,
    createTestApp,
    projectFor,
    registerUser,
    type TestCtx,
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

    const setContent = (c: object, title = 'Shop') =>
        ctx.app.inject({
            method: 'PUT',
            url: `/diagrams/${id}`,
            headers: as(owner),
            payload: { title, content: c },
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
    const add = (
        u: TestUser,
        targetType: string,
        targetId: string,
        body = 'note'
    ) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/comments`,
            headers: as(u),
            payload: { targetType, targetId, body },
        });
    const editorList = async () =>
        (
            await ctx.app.inject({
                url: `/diagrams/${id}/comments`,
                headers: as(owner),
            })
        ).json() as Array<{
            id: string;
            targetId: string;
            orphaned: boolean;
            snapshotVersion: number;
            resolved: boolean;
            authorEmail: string;
        }>;
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

    describe('writing', () => {
        it('requires login', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/comments`,
                payload: { targetType: 'table', targetId: 't1', body: 'x' },
            });
            expect(res.statusCode).toBe(401);
        });

        it('lets owners and editors comment on tables, fields and relationships', async () => {
            const a = await add(owner, 'table', 't1', 'about the table');
            expect(a.statusCode).toBe(201);
            expect(a.json()).toMatchObject({
                targetType: 'table',
                targetId: 't1',
                body: 'about the table',
                resolved: false,
                orphaned: false,
                snapshotVersion: 0,
                authorEmail: 'owner@example.com',
            });
            expect((await add(editor, 'field', 'f1')).statusCode).toBe(201);
            expect((await add(owner, 'relationship', 'r1')).statusCode).toBe(201);
        });

        it('stops viewers and strangers from writing', async () => {
            expect((await add(viewer, 'table', 't1')).statusCode).toBe(403);
            expect((await add(stranger, 'table', 't1')).statusCode).toBe(404);
        });

        it('validates the target and body', async () => {
            expect((await add(owner, 'table', 'missing')).json().error).toBe(
                'target_not_found'
            );
            expect((await add(owner, 'field', 't1')).statusCode).toBe(400);
            expect((await add(owner, 'column', 'f1')).statusCode).toBe(400);
            expect((await add(owner, 'table', 't1', '   ')).statusCode).toBe(400);
            expect(
                (await add(owner, 'table', 't1', 'x'.repeat(2001))).statusCode
            ).toBe(400);
        });

        it('edits, resolves, unresolves and deletes', async () => {
            const made = (await add(owner, 'table', 't2', 'first')).json();
            const url = `/diagrams/${id}/comments/${made.id}`;
            const put = await ctx.app.inject({
                method: 'PUT',
                url,
                headers: as(editor),
                payload: { body: 'second' },
            });
            expect(put.json().body).toBe('second');

            const res = await ctx.app.inject({
                method: 'POST',
                url: `${url}/resolve`,
                headers: as(owner),
            });
            expect(res.json().resolved).toBe(true);
            const un = await ctx.app.inject({
                method: 'POST',
                url: `${url}/resolve`,
                headers: as(owner),
                payload: { resolved: false },
            });
            expect(un.json().resolved).toBe(false);

            const del = await ctx.app.inject({
                method: 'DELETE',
                url,
                headers: as(editor),
            });
            expect(del.statusCode).toBe(204);
            expect(
                (await ctx.app.inject({ method: 'DELETE', url, headers: as(owner) }))
                    .statusCode
            ).toBe(404);
        });

        it('stops viewers from editing, resolving or deleting', async () => {
            const made = (await add(owner, 'table', 't1', 'locked')).json();
            const url = `/diagrams/${id}/comments/${made.id}`;
            for (const [method, path, payload] of [
                ['PUT', url, { body: 'hack' }],
                ['POST', `${url}/resolve`, {}],
                ['DELETE', url, undefined],
            ] as const) {
                const res = await ctx.app.inject({
                    method,
                    url: path,
                    headers: as(viewer),
                    payload,
                });
                expect(res.statusCode, `${method} ${path}`).toBe(403);
            }
            const row = (await editorList()).find((c) => c.id === made.id)!;
            expect(row).toBeDefined();
        });

        it('does not reach a comment through another diagram', async () => {
            const other = (
                await ctx.app.inject({
                    method: 'POST',
                    url: '/diagrams',
                    headers: as(owner),
                    payload: {
                        projectId: await projectFor(ctx.app),
                        title: 'Other',
                        content: content([table('t1')]),
                    },
                })
            ).json().id;
            const made = (await add(owner, 'table', 't1')).json();
            const res = await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${other}/comments/${made.id}`,
                headers: as(owner),
            });
            expect(res.statusCode).toBe(404);
        });
    });

    describe('snapshots, carry-forward and orphans', () => {
        let commentId: string;

        it('keeps comments out of the published view until they are carried', async () => {
            expect((await publicView()).statusCode).toBe(404); // nothing published
            commentId = (await add(owner, 'table', 't1', 'carry me')).json().id;
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
            const fresh = (await add(owner, 'table', 't9', 'brand new')).json().id;
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
            const target = (await add(owner, 'table', 't2', 'resolved one')).json().id;
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/comments/${target}/resolve`,
                headers: as(owner),
            });
            await publish();
            expect((await editorList()).find((c) => c.id === target)!.resolved).toBe(true);
            const pub = (await publicView()).json();
            expect(pub.comments.find((c: { id: string }) => c.id === target).resolved).toBe(true);
        });
    });

    describe('reading', () => {
        it('shows editors everything, including author and orphan flags', async () => {
            const list = await editorList();
            expect(list.length).toBeGreaterThan(0);
            expect(list.every((c) => typeof c.authorEmail === 'string' || c.authorEmail === null)).toBe(true);
        });

        it('shows member viewers only the published view, with no author', async () => {
            const res = await ctx.app.inject({
                url: `/diagrams/${id}/comments`,
                headers: as(viewer),
            });
            expect(res.statusCode).toBe(200);
            expect(res.body).not.toContain('@example.com');
            expect(res.body).not.toContain('authorEmail');
            expect(res.json().every((c: { id: string }) => typeof c.id === 'string')).toBe(true);
        });

        it('hides comments from strangers', async () => {
            const res = await ctx.app.inject({
                url: `/diagrams/${id}/comments`,
                headers: as(stranger),
            });
            expect(res.statusCode).toBe(404);
        });

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

    it('audits comment writes', async () => {
        const actions = new Set(
            (await ctx.db.select().from(auditLog))
                .filter((r) => r.diagramId === id)
                .map((r) => r.action)
        );
        for (const a of ['comment.create', 'comment.update', 'comment.resolve', 'comment.delete']) {
            expect(actions.has(a as never), a).toBe(true);
        }
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
