import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z, type ZodType } from 'zod';

// the editor's own checks of what this server answers (src/lib/qubdi/api.ts)
import * as shape from '../../src/lib/qubdi/api-schemas.js';
import {
    as,
    createDiagram,
    createTestApp,
    grant,
    projectFor,
    registerUser,
    sampleContent,
    withBase,
    type TestCtx,
    type TestUser,
} from './helpers.js';

// What the editor checks in each answer must be what the server really sends:
// a check stricter than the server would turn a working call into an error.
describe('the editor accepts what the server answers', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let projectId: string;
    let diagramId: string;

    const call = async (
        who: TestUser,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH',
        url: string,
        payload?: object
    ) => {
        const res = await ctx.app.inject({
            method,
            url,
            headers: as(who),
            ...(payload ? { payload } : {}),
        });
        expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(
            300
        );
        return res.json();
    };
    const accepts = (schema: ZodType, body: unknown, what: string) => {
        const parsed = schema.safeParse(body);
        expect(
            parsed.success,
            `${what}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`
        ).toBe(true);
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        projectId = await projectFor(ctx.app);
        await grant(ctx.app, editor, 'editor');
        await grant(ctx.app, viewer, 'viewer');
        diagramId = await createDiagram(ctx.app, editor);
    });
    afterAll(() => ctx.close());

    it('projects and diagrams, for a writer and for a viewer', async () => {
        accepts(
            shape.page(shape.myProject),
            await call(editor, 'GET', '/projects'),
            'project list'
        );
        accepts(
            shape.myProject,
            await call(editor, 'GET', `/projects/${projectId}`),
            'project'
        );
        const created = await call(editor, 'POST', '/diagrams', {
            title: 'Contract',
            content: sampleContent,
            projectId,
        });
        accepts(shape.remoteDiagram, created, 'created diagram');
        accepts(
            shape.diagramList,
            await call(editor, 'GET', '/diagrams'),
            'diagram list'
        );
        accepts(
            shape.diagramSummary,
            await call(editor, 'GET', `/diagrams/${diagramId}/summary`),
            'summary'
        );
        accepts(
            shape.remoteDiagram,
            await call(editor, 'GET', `/diagrams/${diagramId}`),
            'diagram'
        );
        accepts(
            shape.publishStatusOnly,
            await call(editor, 'GET', `/diagrams/${diagramId}/publish-status`),
            'publish status'
        );
        accepts(
            shape.lockAnswer,
            await call(editor, 'POST', `/diagrams/${diagramId}/lock`, {
                editorId: 'tab-contract-1',
            }),
            'lock'
        );
        const saved = await call(
            editor,
            'PUT',
            `/diagrams/${diagramId}`,
            await withBase(ctx.app, editor, diagramId, {
                editorId: 'tab-contract-1',
                content: { ...sampleContent, name: 'Renamed' },
            })
        );
        accepts(shape.savedDiagram, saved, 'saved diagram');
        accepts(
            shape.publishResult,
            await call(editor, 'POST', `/diagrams/${diagramId}/publish`, {
                note: 'first',
            }),
            'publish'
        );
        accepts(
            shape.diagramList,
            await call(viewer, 'GET', '/diagrams'),
            "viewer's list"
        );
        accepts(
            shape.diagramSummary,
            await call(viewer, 'GET', `/diagrams/${diagramId}/summary`),
            "viewer's summary"
        );
        accepts(
            shape.remoteDiagram,
            await call(viewer, 'GET', `/diagrams/${diagramId}`),
            "viewer's diagram"
        );
    });

    it('asking the holder to step out, and what the lock stream says about it', async () => {
        const base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
        /** the first event of this name on one editor's lock stream, read off a real socket */
        const heard = async (
            who: TestUser,
            editorId: string,
            id: string,
            name: string
        ) => {
            const controller = new AbortController();
            const res = await fetch(
                `${base}/diagrams/${id}/lock/events?editorId=${editorId}`,
                { headers: as(who), signal: controller.signal }
            );
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let text = '';
            const deadline = Date.now() + 4000;
            try {
                for (;;) {
                    const found = new RegExp(`event: ${name}\\ndata: (.*)\\n\\n`).exec(text);
                    if (found) return JSON.parse(found[1]) as unknown;
                    if (Date.now() > deadline) throw new Error(`no ${name}: ${text}`);
                    const chunk = await reader.read();
                    if (chunk.done) throw new Error(`ended before ${name}: ${text}`);
                    text += decoder.decode(chunk.value);
                }
            } finally {
                controller.abort();
            }
        };

        // nobody is editing: the diagram is set aside for the one who asks
        const free = await createDiagram(ctx.app, editor, 'Free');
        const granted = await call(admin, 'POST', `/diagrams/${free}/lock/poke`, {
            editorId: 'tab-asker',
        });
        accepts(shape.pokeAnswer, granted, 'poke of a free diagram');
        expect(granted.status).toBe('granted');

        // someone is: the request goes to them
        const busy = await createDiagram(ctx.app, editor, 'Busy');
        await call(editor, 'POST', `/diagrams/${busy}/lock`, { editorId: 'tab-holder' });
        const sent = await call(admin, 'POST', `/diagrams/${busy}/lock/poke`, {
            editorId: 'tab-asker',
        });
        accepts(shape.pokeAnswer, sent, 'poke of a busy diagram');
        expect(sent.status).toBe('sent');

        accepts(
            shape.pokeEvent,
            await heard(editor, 'tab-holder', busy, 'poke'),
            'request to step out'
        );

        const answered = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${busy}/lock/pokes/${sent.pokeId}/answer`,
            headers: as(editor),
            payload: { editorId: 'tab-holder', accept: false },
        });
        expect(answered.statusCode).toBe(204);
        accepts(
            shape.pokeResultEvent,
            await heard(admin, 'tab-asker', busy, 'poke-result'),
            'answer to a request'
        );
    });

    it('share links, a public share, lint and drift', async () => {
        const link = await call(
            editor,
            'POST',
            `/diagrams/${diagramId}/share-links`,
            { access: 'anyone', live: true }
        );
        accepts(shape.shareLinkWithToken, link, 'new share link');
        accepts(
            z.array(shape.shareLink),
            await call(editor, 'GET', `/diagrams/${diagramId}/share-links`),
            'share links'
        );
        accepts(
            shape.shareLink,
            await call(
                editor,
                'PATCH',
                `/diagrams/${diagramId}/share-links/${link.id}`,
                { live: false }
            ),
            'updated share link'
        );
        const regenerated = await call(
            editor,
            'POST',
            `/diagrams/${diagramId}/share-links/${link.id}/regenerate`
        );
        accepts(shape.shareLinkWithToken, regenerated, 'regenerated share link');
        const token = regenerated.token;
        const shared = await ctx.app.inject({ url: `/s/${token}` });
        expect(shared.statusCode).toBe(200);
        accepts(shape.publicShare, shared.json(), 'public share');

        accepts(
            shape.lintConfig,
            await call(editor, 'GET', `/diagrams/${diagramId}/lint-config`),
            'lint config'
        );
        accepts(
            shape.lintConfig,
            await call(editor, 'PUT', `/diagrams/${diagramId}/lint-config`, {
                config: {
                    rules: { 'naming-case': { enabled: false } },
                    naming: { style: 'snake_case' },
                },
            }),
            'saved lint config'
        );
        accepts(
            shape.driftOverview,
            await call(editor, 'GET', `/diagrams/${diagramId}/drift`),
            'drift overview, none set'
        );
        accepts(
            shape.driftSettings,
            await call(editor, 'PUT', `/diagrams/${diagramId}/drift`, {
                connectionId: null,
                schemas: ['public'],
                tables: [],
                sourceKeys: { tables: {}, columns: {} },
            }),
            'drift settings'
        );
        accepts(
            shape.driftOverview,
            await call(editor, 'GET', `/diagrams/${diagramId}/drift`),
            'drift overview, set'
        );
        accepts(
            shape.driftDismissResult,
            await call(editor, 'POST', `/diagrams/${diagramId}/drift/dismiss`),
            'drift dismiss'
        );
    });

    it('the admin panel and the connections list', async () => {
        accepts(
            shape.page(shape.adminUser),
            await call(admin, 'GET', '/admin/users'),
            'admin users'
        );
        accepts(
            shape.adminUser,
            await call(admin, 'POST', '/admin/users', {
                email: 'new@example.com',
                password: 'Password-123!',
            }),
            'new user'
        );
        accepts(
            shape.adminUserChange,
            await call(admin, 'PATCH', `/admin/users/${editor.id}`, {
                isActive: true,
            }),
            'user update'
        );
        accepts(
            z.array(shape.adminSession),
            await call(admin, 'GET', `/admin/users/${editor.id}/sessions`),
            'user sessions'
        );
        accepts(
            shape.bulkUsersResult,
            await call(admin, 'POST', '/admin/users/bulk', {
                action: 'enable',
                ids: [editor.id],
            }),
            'bulk users'
        );
        accepts(
            shape.adminStats,
            await call(admin, 'GET', '/admin/stats?tz=UTC'),
            'stats'
        );
        accepts(
            shape.page(shape.adminDiagram),
            await call(admin, 'GET', '/admin/diagrams'),
            'admin diagrams'
        );
        accepts(
            z.array(shape.adminShareLink),
            await call(
                admin,
                'GET',
                `/admin/diagrams/${diagramId}/share-links`
            ),
            'admin share links'
        );
        accepts(
            shape.activityPage,
            await call(admin, 'GET', '/admin/audit'),
            'activity'
        );
        accepts(
            shape.page(shape.adminProject),
            await call(admin, 'GET', '/admin/projects'),
            'admin projects'
        );
        const made = await call(admin, 'POST', '/admin/projects', {
            name: 'Second',
        });
        accepts(shape.adminProject, made, 'new project');
        accepts(
            shape.adminProjectRow,
            await call(admin, 'PATCH', `/admin/projects/${made.id}`, {
                description: 'x',
            }),
            'project update'
        );
        accepts(
            z.array(shape.projectMember),
            await call(admin, 'GET', `/admin/projects/${projectId}/members`),
            'project members'
        );
        accepts(
            shape.projectMember,
            await call(
                admin,
                'PUT',
                `/admin/projects/${projectId}/members/${viewer.id}`,
                { role: 'viewer' }
            ),
            'member set'
        );
        accepts(
            shape.introspectCapabilities,
            await call(editor, 'GET', '/introspect/capabilities'),
            'capabilities'
        );
        accepts(
            z.array(shape.savedConnection),
            await call(
                editor,
                'GET',
                `/introspect/connections?projectId=${projectId}`
            ),
            'saved connections'
        );
    });
});
