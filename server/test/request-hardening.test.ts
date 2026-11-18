import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagrams, projects, users } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    projectFor,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
    withBase,
} from './helpers.js';

// What the API does with requests that are malformed, oversized, of the wrong
// type or shaped to attack the parser: always a 4xx that names no internals,
// never a 500 and never a change.
describe('request hardening', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let editor: TestUser;
    let diagramId: string;
    let projectId: string;

    beforeAll(async () => {
        // a small general body limit, so it can be reached cheaply
        ctx = await createTestApp({ bodyLimit: 4096 });
        admin = await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        diagramId = await createDiagram(ctx.app, editor);
        projectId = await projectFor(ctx.app);
    });
    afterAll(() => ctx.close());

    const raw = (
        method: 'POST' | 'PUT' | 'PATCH',
        url: string,
        body: string,
        headers: Record<string, string> = {},
        who: TestUser | null = editor
    ) =>
        ctx.app.inject({
            method,
            url,
            body,
            headers: {
                'content-type': 'application/json',
                ...(who ? as(who) : {}),
                ...headers,
            },
        });

    describe('bodies the parser refuses', () => {
        it.each([
            ['POST', '/auth/login', null],
            ['POST', '/diagrams', 'editor'],
            ['PUT', '/diagrams/:id', 'editor'],
            ['POST', '/admin/projects', 'admin'],
            ['POST', '/lint', 'editor'],
        ] as const)('answers 400 to broken JSON on %s %s', async (method, path, whoName) => {
            const who = whoName === 'admin' ? admin : whoName === 'editor' ? editor : null;
            const res = await raw(method, path.replace(':id', diagramId), '{"title": "x",', {}, who);
            expect(res.statusCode).toBe(400);
            expect(res.body).not.toMatch(/at .*\.(js|ts):\d+/);
        });

        it('answers 415 to a form body, and 400 to plain text', async () => {
            const res = await raw('POST', '/admin/projects', 'name=Planted', {
                'content-type': 'application/x-www-form-urlencoded',
            }, admin);
            expect(res.statusCode).toBe(415);
            // Fastify reads text/plain as a string, which no route schema takes
            const text = await raw('POST', '/auth/login', 'admin@example.com', {
                'content-type': 'text/plain',
            }, null);
            expect(text.statusCode).toBe(400);
            expect(text.json().error).toBe('invalid_request');
            const [planted] = await ctx.db
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.name, 'Planted'));
            expect(planted).toBeUndefined();
        });

        it('answers 413 to a body over the limit, before reading it all', async () => {
            const res = await raw(
                'POST',
                '/auth/login',
                JSON.stringify({ email: 'admin@example.com', password: 'x'.repeat(10_000) }),
                {},
                null
            );
            expect(res.statusCode).toBe(413);
        });

        it('refuses __proto__ and constructor.prototype keys outright', async () => {
            for (const body of [
                '{"name":"Polluted","__proto__":{"isAdmin":true}}',
                '{"name":"Polluted","constructor":{"prototype":{"isAdmin":true}}}',
            ]) {
                const res = await raw('POST', '/admin/projects', body, {}, admin);
                expect(res.statusCode).toBe(400);
            }
            // nothing on the shared prototype, and nobody became an admin
            expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
            const [row] = await ctx.db
                .select({ isAdmin: users.isAdmin })
                .from(users)
                .where(eq(users.id, editor.id));
            expect(row.isAdmin).toBe(false);
        });

        it('does not take the role from a body sent by a non-admin', async () => {
            const res = await raw(
                'PUT',
                `/diagrams/${diagramId}`,
                JSON.stringify({ title: 'Mine now', role: 'owner', isAdmin: true }),
            );
            expect(res.statusCode).toBe(200);
            expect(res.json().role).toBe('editor');
            expect((await ctx.app.inject({ url: '/auth/me', headers: as(editor) })).json().isAdmin).toBe(
                false
            );
        });
    });

    describe('values the schemas refuse', () => {
        it.each([
            ['an empty title', { title: '   ' }],
            ['a title over 200 characters', { title: 'x'.repeat(201) }],
            ['a title that is not a string', { title: 42 }],
            ['tables that are not a list', { content: { ...sampleContent, tables: 'all' } }],
            ['a content that is a string', { content: 'DROP TABLE users' }],
            ['autoPublish as a string', { autoPublish: 'yes' }],
            ['nothing to change', {}],
        ])('answers 400 to a save with %s, and keeps the diagram', async (_name, change) => {
            const [before] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramId));
            const res = await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${diagramId}`,
                headers: as(editor),
                payload: await withBase(ctx.app, editor, diagramId, change),
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toBe('invalid_request');
            const [after] = await ctx.db.select().from(diagrams).where(eq(diagrams.id, diagramId));
            expect(after.updatedAt).toEqual(before.updatedAt);
        });

        it('answers 400 to paging past what it allows', async () => {
            for (const query of ['limit=0', 'limit=501', 'offset=-1', 'limit=abc']) {
                const res = await ctx.app.inject({
                    url: `/diagrams?${query}`,
                    headers: as(editor),
                });
                expect(res.statusCode, query).toBe(400);
            }
        });

        it('treats search text as text, not as a pattern or SQL', async () => {
            for (const q of ["%' or '1'='1", '%', '_', '\\']) {
                const res = await ctx.app.inject({
                    url: `/projects?q=${encodeURIComponent(q)}`,
                    headers: as(editor),
                });
                expect(res.statusCode, q).toBe(200);
                expect(res.json().items, q).toEqual([]);
            }
            // the same search an admin makes over every account
            const everyone = await ctx.app.inject({
                url: `/admin/users?q=${encodeURIComponent('%')}`,
                headers: as(admin),
            });
            expect(everyone.json().items).toEqual([]);
        });
    });

    describe('text Postgres cannot store', () => {
        it('SRV-047: answers a diagram title with a NUL character as a client error', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(editor),
                payload: { title: 'bad\u0000title', content: sampleContent, projectId },
            });
            expect(res.statusCode).toBe(400);
        });

        it('SRV-047: answers diagram content with a NUL character as a client error', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/diagrams',
                headers: as(editor),
                payload: {
                    title: 'NUL content',
                    content: { ...sampleContent, name: 'bad\u0000name' },
                    projectId,
                },
            });
            expect(res.statusCode).toBe(400);
        });

        it('answers a sign-in with a NUL character in the password as a failed sign-in', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'admin@example.com', password: 'Pass\u0000word' },
            });
            expect(res.statusCode).toBe(401);
        });
    });
});
