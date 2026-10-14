import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, shareLinks } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    sampleContent,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('share links', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let editor: TestUser;
    let viewer: TestUser;
    let stranger: TestUser;
    let id: string;

    const createLink = (u: TestUser, payload: object = {}, diagramId = id) =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagramId}/share-links`,
            headers: as(u),
            payload,
        });
    const open = (token: string, headers = {}) =>
        ctx.app.inject({ url: `/s/${token}`, headers });
    const publish = () =>
        ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/publish`,
            headers: as(owner),
            payload: {},
        });

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
        editor = await registerUser(ctx.app, 'editor@example.com');
        viewer = await registerUser(ctx.app, 'viewer@example.com');
        stranger = await registerUser(ctx.app, 'stranger@example.com');
        id = await createDiagram(ctx.app, owner);
        for (const [u, role] of [
            [editor, 'editor'],
            [viewer, 'viewer'],
        ] as const) {
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/members`,
                headers: as(owner),
                payload: { email: u.email, role },
            });
        }
    });
    afterAll(() => ctx.close());

    describe('management', () => {
        it('requires login', async () => {
            const res = await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links`,
                payload: {},
            });
            expect(res.statusCode).toBe(401);
        });

        it('lets owners and editors create links, but not viewers or strangers', async () => {
            expect((await createLink(owner)).statusCode).toBe(201);
            expect((await createLink(editor)).statusCode).toBe(201);
            expect((await createLink(viewer)).statusCode).toBe(403);
            expect((await createLink(stranger)).statusCode).toBe(404);
        });

        it('returns the raw token once and stores only its hash', async () => {
            const res = await createLink(owner, { access: 'anyone' });
            const body = res.json();
            expect(body.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
            expect(body).not.toHaveProperty('tokenHash');
            const [row] = await ctx.db
                .select()
                .from(shareLinks)
                .where(eq(shareLinks.id, body.id));
            expect(row.tokenHash).not.toBe(body.token);
            expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);

            const list = await ctx.app.inject({
                url: `/diagrams/${id}/share-links`,
                headers: as(owner),
            });
            const text = list.body;
            expect(text).not.toContain(body.token);
            expect(text).not.toContain(row.tokenHash);
        });

        it('hides the list from viewers and strangers', async () => {
            const v = await ctx.app.inject({
                url: `/diagrams/${id}/share-links`,
                headers: as(viewer),
            });
            expect(v.statusCode).toBe(403);
            const s = await ctx.app.inject({
                url: `/diagrams/${id}/share-links`,
                headers: as(stranger),
            });
            expect(s.statusCode).toBe(404);
        });

        it('validates input', async () => {
            expect(
                (await createLink(owner, { access: 'everyone' })).statusCode
            ).toBe(400);
            expect(
                (await createLink(owner, { expiresAt: '2001-01-01T00:00:00Z' }))
                    .statusCode
            ).toBe(400);
            expect(
                (await createLink(owner, { expiresAt: 'tomorrow' })).statusCode
            ).toBe(400);
        });

        it('changes access, expiry and live, and clears expiry with null', async () => {
            const { id: linkId } = (await createLink(owner)).json();
            const soon = new Date(Date.now() + 3_600_000).toISOString();
            const patch = (payload: object) =>
                ctx.app.inject({
                    method: 'PATCH',
                    url: `/diagrams/${id}/share-links/${linkId}`,
                    headers: as(editor),
                    payload,
                });
            const a = await patch({ access: 'signed_in', expiresAt: soon, live: true });
            expect(a.json()).toMatchObject({ access: 'signed_in', live: true });
            expect(new Date(a.json().expiresAt).toISOString()).toBe(soon);
            const b = await patch({ expiresAt: null });
            expect(b.json().expiresAt).toBeNull();
            expect(b.json().access).toBe('signed_in');
            expect((await patch({})).statusCode).toBe(400);
        });

        it('stops viewers from changing or revoking links', async () => {
            const { id: linkId } = (await createLink(owner)).json();
            const p = await ctx.app.inject({
                method: 'PATCH',
                url: `/diagrams/${id}/share-links/${linkId}`,
                headers: as(viewer),
                payload: { access: 'off' },
            });
            expect(p.statusCode).toBe(403);
            const d = await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${id}/share-links/${linkId}`,
                headers: as(viewer),
            });
            expect(d.statusCode).toBe(403);
        });

        it('does not let a link be managed through a different diagram', async () => {
            const other = await createDiagram(ctx.app, owner, 'Other');
            const { id: linkId } = (await createLink(owner)).json();
            const res = await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${other}/share-links/${linkId}`,
                headers: as(owner),
            });
            expect(res.statusCode).toBe(404);
        });

        it('audits create, update, revoke and regenerate', async () => {
            const fresh = await createDiagram(ctx.app, owner, 'Audited');
            const made = (await createLink(owner, {}, fresh)).json();
            await ctx.app.inject({
                method: 'PATCH',
                url: `/diagrams/${fresh}/share-links/${made.id}`,
                headers: as(owner),
                payload: { live: true },
            });
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${fresh}/share-links/${made.id}/regenerate`,
                headers: as(owner),
            });
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${fresh}/share-links/${made.id}`,
                headers: as(owner),
            });
            const actions = (await ctx.db.select().from(auditLog))
                .filter((r) => r.diagramId === fresh && r.action.startsWith('share.'))
                .map((r) => r.action);
            expect(actions).toEqual([
                'share.create',
                'share.update',
                'share.regenerate',
                'share.revoke',
            ]);
        });
    });

    describe('public route', () => {
        it('404s while nothing is published', async () => {
            const fresh = await createDiagram(ctx.app, owner, 'Unpublished');
            const { token } = (await createLink(owner, {}, fresh)).json();
            expect((await open(token)).statusCode).toBe(404);
        });

        it('serves the latest snapshot and never the working copy', async () => {
            const { token } = (await createLink(owner)).json();
            await publish();
            await ctx.app.inject({
                method: 'PUT',
                url: `/diagrams/${id}`,
                headers: as(owner),
                payload: {
                    title: 'Draft title',
                    content: { ...sampleContent, name: 'Draft' },
                },
            });
            const res = await open(token);
            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({
                title: 'My diagram',
                version: 1,
                content: sampleContent,
            });
            expect(res.body).not.toContain('Draft');
            expect(res.body).not.toContain(owner.id);
            expect(res.body).not.toContain('owner@example.com');

            await publish();
            const after = await open(token);
            expect(after.json().version).toBe(2);
            expect(after.json().title).toBe('Draft title');
        });

        it('works without any session cookie', async () => {
            const { token } = (await createLink(owner)).json();
            const res = await ctx.app.inject({ url: `/s/${token}` });
            expect(res.statusCode).toBe(200);
        });

        it('404s for unknown and malformed tokens', async () => {
            expect((await open('A'.repeat(22))).statusCode).toBe(404);
            expect((await open('nope')).statusCode).toBe(404);
            expect((await open('x'.repeat(300))).statusCode).toBe(404);
        });

        it('404s once the link is revoked, and revoking twice is harmless', async () => {
            const { id: linkId, token } = (await createLink(owner)).json();
            expect((await open(token)).statusCode).toBe(200);
            const del = () =>
                ctx.app.inject({
                    method: 'DELETE',
                    url: `/diagrams/${id}/share-links/${linkId}`,
                    headers: as(owner),
                });
            expect((await del()).statusCode).toBe(204);
            expect((await del()).statusCode).toBe(204);
            expect((await open(token)).statusCode).toBe(404);
        });

        it('404s once the link has expired', async () => {
            const { id: linkId, token } = (
                await createLink(owner, {
                    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                })
            ).json();
            expect((await open(token)).statusCode).toBe(200);
            await ctx.db
                .update(shareLinks)
                .set({ expiresAt: new Date(Date.now() - 1000) })
                .where(eq(shareLinks.id, linkId));
            expect((await open(token)).statusCode).toBe(404);
        });

        it('404s when access is off and comes back when re-enabled', async () => {
            const { id: linkId, token } = (await createLink(owner)).json();
            const patch = (access: string) =>
                ctx.app.inject({
                    method: 'PATCH',
                    url: `/diagrams/${id}/share-links/${linkId}`,
                    headers: as(owner),
                    payload: { access },
                });
            await patch('off');
            expect((await open(token)).statusCode).toBe(404);
            await patch('anyone');
            expect((await open(token)).statusCode).toBe(200);
        });

        it('asks anonymous visitors to sign in for signed_in links', async () => {
            const { token } = (await createLink(owner, { access: 'signed_in' })).json();
            const anon = await open(token);
            expect(anon.statusCode).toBe(401);
            expect(anon.json().error).toBe('login_required');
            const named = await open(token, as(stranger));
            expect(named.statusCode).toBe(200);
        });

        it('invalidates the old token on regenerate', async () => {
            const made = (await createLink(owner)).json();
            const re = await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links/${made.id}/regenerate`,
                headers: as(owner),
            });
            expect(re.statusCode).toBe(200);
            expect(re.json().token).not.toBe(made.token);
            expect((await open(made.token)).statusCode).toBe(404);
            expect((await open(re.json().token)).statusCode).toBe(200);
        });

        it('refuses to regenerate a revoked link', async () => {
            const made = (await createLink(owner)).json();
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${id}/share-links/${made.id}`,
                headers: as(owner),
            });
            const re = await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${id}/share-links/${made.id}/regenerate`,
                headers: as(owner),
            });
            expect(re.statusCode).toBe(409);
        });

        it('exposes no way to modify anything', async () => {
            const { token } = (await createLink(owner)).json();
            for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
                const res = await ctx.app.inject({
                    method,
                    url: `/s/${token}`,
                    payload: { title: 'hacked' },
                });
                expect(res.statusCode, method).toBe(404);
            }
            const check = await ctx.app.inject({
                url: `/diagrams/${id}`,
                headers: as(owner),
            });
            expect(check.json().title).not.toBe('hacked');
        });

        it('stops serving after the diagram is deleted', async () => {
            const tmp = await createDiagram(ctx.app, owner, 'Temp');
            const { token } = (await createLink(owner, {}, tmp)).json();
            await ctx.app.inject({
                method: 'POST',
                url: `/diagrams/${tmp}/publish`,
                headers: as(owner),
                payload: {},
            });
            expect((await open(token)).statusCode).toBe(200);
            await ctx.app.inject({
                method: 'DELETE',
                url: `/diagrams/${tmp}`,
                headers: as(owner),
            });
            expect((await open(token)).statusCode).toBe(404);
        });
    });
});

describe('share rate limit', () => {
    it('answers 429 after too many public requests', async () => {
        const ctx = await createTestApp({ shareRateLimit: 3 });
        try {
            const statuses: number[] = [];
            for (let i = 0; i < 5; i++) {
                const res = await ctx.app.inject({
                    url: `/s/${'A'.repeat(22)}`,
                });
                statuses.push(res.statusCode);
            }
            expect(statuses.slice(0, 3)).toEqual([404, 404, 404]);
            expect(statuses.slice(3)).toEqual([429, 429]);
        } finally {
            await ctx.close();
        }
    });

    it('does not rate limit the authenticated API', async () => {
        const ctx = await createTestApp({ shareRateLimit: 1 });
        try {
            for (let i = 0; i < 4; i++) {
                const res = await ctx.app.inject({ url: '/health' });
                expect(res.statusCode).toBe(200);
            }
        } finally {
            await ctx.close();
        }
    });
});
