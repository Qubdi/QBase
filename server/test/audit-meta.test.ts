import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanMeta } from '../src/audit/audit.js';
import { auditLog } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

interface AuditItem {
    action: string;
    userId: string;
    diagramId: string | null;
    meta: Record<string, unknown> | null;
}

describe('audit meta: what an action was done to', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let member: TestUser;

    const call = (
        user: TestUser,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        url: string,
        payload?: object
    ) => ctx.app.inject({ method, url, headers: as(user), payload });

    /** The newest audit row with this action, as an admin sees it. */
    const latest = async (action: string): Promise<AuditItem> => {
        const res = await call(
            admin,
            'GET',
            `/admin/audit?action=${action}&limit=1`
        );
        expect(res.statusCode).toBe(200);
        return res.json().items[0];
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        member = await registerUser(ctx.app, 'member@example.com');
    });
    afterAll(() => ctx.close());

    describe('projects and members', () => {
        let projectId: string;

        it('records the project on create and on rename', async () => {
            const created = await call(admin, 'POST', '/admin/projects', {
                name: 'Billing',
            });
            expect(created.statusCode).toBe(201);
            projectId = created.json().id;
            expect((await latest('project.create')).meta).toEqual({
                projectId,
                name: 'Billing',
            });

            await call(admin, 'PATCH', `/admin/projects/${projectId}`, {
                name: 'Billing and invoices',
            });
            expect((await latest('project.update')).meta).toEqual({
                projectId,
                name: 'Billing and invoices',
            });
        });

        it('records who was given which role, and who was removed', async () => {
            await call(
                admin,
                'PUT',
                `/admin/projects/${projectId}/members/${member.id}`,
                { role: 'viewer' }
            );
            expect((await latest('project.member_set')).meta).toEqual({
                projectId,
                targetUserId: member.id,
                role: 'viewer',
            });

            await call(
                admin,
                'DELETE',
                `/admin/projects/${projectId}/members/${member.id}`
            );
            expect((await latest('project.member_remove')).meta).toEqual({
                projectId,
                targetUserId: member.id,
            });
        });

        it('keeps the name of a project that has been deleted', async () => {
            const gone = await call(
                admin,
                'DELETE',
                `/admin/projects/${projectId}`
            );
            expect(gone.statusCode).toBe(204);
            expect((await latest('project.delete')).meta).toEqual({
                projectId,
                name: 'Billing and invoices',
            });
        });
    });

    describe('users', () => {
        let targetId: string;

        it('records the user on create', async () => {
            const created = await call(admin, 'POST', '/admin/users', {
                email: 'target@example.com',
                password: 'Password-123!',
            });
            expect(created.statusCode).toBe(201);
            targetId = created.json().id;
            expect((await latest('user.create')).meta).toEqual({
                targetUserId: targetId,
                isAdmin: false,
            });
        });

        it('records what an update changed', async () => {
            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                password: 'Another-password-1!',
            });
            expect((await latest('user.update')).meta).toEqual({
                targetUserId: targetId,
                changed: ['password'],
            });

            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isAdmin: true,
            });
            expect((await latest('user.update')).meta).toEqual({
                targetUserId: targetId,
                changed: ['isAdmin'],
                isAdmin: true,
            });

            // a revoke is told from a grant by the new value
            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isAdmin: false,
            });
            expect((await latest('user.update')).meta).toEqual({
                targetUserId: targetId,
                changed: ['isAdmin'],
                isAdmin: false,
            });

            // the next test expects the target to be an admin again
            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isAdmin: true,
            });
        });

        it('does not list a field that was sent but did not change', async () => {
            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isAdmin: true,
                password: 'A-third-password-1!',
                // the target is an admin by now: resetting its password needs the acting admin's own
                adminPassword: 'Password-123!',
            });
            expect((await latest('user.update')).meta).toEqual({
                targetUserId: targetId,
                changed: ['password'],
            });
        });

        it('records a disable and an enable under their own actions', async () => {
            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isActive: false,
            });
            expect((await latest('user.disable')).meta).toEqual({
                targetUserId: targetId,
                changed: ['isActive'],
            });

            await call(admin, 'PATCH', `/admin/users/${targetId}`, {
                isActive: true,
            });
            expect((await latest('user.enable')).meta).toEqual({
                targetUserId: targetId,
                changed: ['isActive'],
            });
        });

        it('records the id of a deleted user', async () => {
            const gone = await call(
                admin,
                'DELETE',
                `/admin/users/${targetId}`
            );
            expect(gone.statusCode).toBe(204);
            expect((await latest('user.delete')).meta).toEqual({
                targetUserId: targetId,
            });
        });

        it('never holds an email address, so the log outlives an erased account', async () => {
            const all = await call(admin, 'GET', '/admin/audit?limit=100');
            const metas = all
                .json()
                .items.map((r: AuditItem) => r.meta)
                .filter(Boolean);
            expect(metas.length).toBeGreaterThan(0);
            expect(JSON.stringify(metas)).not.toContain('@');
        });
    });

    describe('diagrams', () => {
        let diagramId: string;
        let projectId: string;

        it('records the project and title on create', async () => {
            diagramId = await createDiagram(ctx.app, admin, 'Orders');
            projectId = (
                await call(admin, 'GET', `/diagrams/${diagramId}`)
            ).json().projectId;
            const row = await latest('diagram.create');
            expect(row.diagramId).toBe(diagramId);
            expect(row.meta).toEqual({ projectId, name: 'Orders' });
        });

        it('leaves a save without meta: it is the most frequent action', async () => {
            const saved = await call(admin, 'PUT', `/diagrams/${diagramId}`, {
                title: 'Orders v2',
            });
            expect(saved.statusCode).toBe(200);
            const row = await latest('diagram.update');
            expect(row.diagramId).toBe(diagramId);
            expect(row.meta).toBeNull();
        });

        it('records the version on every publish', async () => {
            await call(admin, 'POST', `/diagrams/${diagramId}/publish`, {});
            expect((await latest('diagram.publish')).meta).toEqual({
                version: 1,
            });
            await call(admin, 'POST', `/diagrams/${diagramId}/publish`, {});
            expect((await latest('diagram.publish')).meta).toEqual({
                version: 2,
            });
        });

        it('records the version of an automatic publish on save too', async () => {
            const current = (
                await call(admin, 'GET', `/diagrams/${diagramId}`)
            ).json();
            const saved = await call(admin, 'PUT', `/diagrams/${diagramId}`, {
                autoPublish: true,
                content: {
                    ...current.content,
                    name: 'Changed for auto publish',
                },
                baseUpdatedAt: current.updatedAt,
            });
            expect(saved.statusCode).toBe(200);
            expect((await latest('diagram.publish')).meta).toEqual({
                version: 3,
            });
        });

        it('keeps the title of a diagram that has been deleted', async () => {
            const gone = await call(admin, 'DELETE', `/diagrams/${diagramId}`);
            expect(gone.statusCode).toBe(204);
            const row = await latest('diagram.delete');
            expect(row.diagramId).toBe(diagramId);
            expect(row.meta).toEqual({ projectId, name: 'Orders v2' });
        });
    });

    describe('share links', () => {
        it('records the link and its access, never the token', async () => {
            const diagramId = await createDiagram(ctx.app, admin, 'Shared');
            const created = await call(
                admin,
                'POST',
                `/diagrams/${diagramId}/share-links`,
                { access: 'anyone' }
            );
            expect(created.statusCode).toBe(201);
            const { id: linkId, token } = created.json();
            const row = await latest('share.create');
            expect(row.diagramId).toBe(diagramId);
            expect(row.meta).toEqual({ linkId, access: 'anyone' });

            await call(
                admin,
                'PATCH',
                `/diagrams/${diagramId}/share-links/${linkId}`,
                { access: 'signed_in' }
            );
            expect((await latest('share.update')).meta).toEqual({
                linkId,
                access: 'signed_in',
            });

            // expiry and live are recorded when the request changed them
            const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
            await call(
                admin,
                'PATCH',
                `/diagrams/${diagramId}/share-links/${linkId}`,
                { expiresAt, live: true }
            );
            expect((await latest('share.update')).meta).toEqual({
                linkId,
                access: 'signed_in',
                expiresAt,
                live: true,
            });

            const again = await call(
                admin,
                'POST',
                `/diagrams/${diagramId}/share-links/${linkId}/regenerate`
            );
            expect(again.statusCode).toBe(200);
            expect((await latest('share.regenerate')).meta).toEqual({ linkId });

            await call(
                admin,
                'DELETE',
                `/diagrams/${diagramId}/share-links/${linkId}`
            );
            expect((await latest('share.revoke')).meta).toEqual({
                linkId,
                access: 'signed_in',
                madeAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
            });

            const everything = JSON.stringify(
                (await call(admin, 'GET', '/admin/audit?limit=100')).json()
            );
            expect(everything).not.toContain(token);
            expect(everything).not.toContain(again.json().token);
        });
    });

    it('lists a row written without meta as null', async () => {
        await ctx.db
            .insert(auditLog)
            .values({ userId: admin.id, action: 'user.register' });
        const row = await latest('user.register');
        expect(row.meta).toBeNull();
    });
});

describe('cleanMeta', () => {
    it('is null when there is nothing to keep', () => {
        expect(cleanMeta(undefined)).toBeNull();
        expect(cleanMeta({})).toBeNull();
        expect(cleanMeta({ projectId: undefined })).toBeNull();
    });

    it('drops unset fields and keeps the rest as given', () => {
        expect(
            cleanMeta({
                projectId: 'p',
                targetUserId: undefined,
                role: 'editor',
                version: 3,
                changed: ['password'],
            })
        ).toEqual({
            projectId: 'p',
            role: 'editor',
            version: 3,
            changed: ['password'],
        });
    });

    it('cuts a long name to 100 characters, and does not touch what it was given', () => {
        const given = { name: 'n'.repeat(500) };
        expect(cleanMeta(given)?.name).toHaveLength(100);
        expect(given.name).toHaveLength(500);
    });

    it('stays inside the 1 KB the table allows, even with the longest name', () => {
        const largest = cleanMeta({
            projectId: '00000000-0000-0000-0000-000000000000',
            targetUserId: '00000000-0000-0000-0000-000000000000',
            linkId: '00000000-0000-0000-0000-000000000000',
            role: 'editor',
            access: 'signed_in',
            version: 2_147_483_647,
            name: '\u{1F600}'.repeat(500),
            changed: ['password', 'isAdmin', 'isActive'],
        });
        expect(Buffer.byteLength(JSON.stringify(largest))).toBeLessThanOrEqual(
            1024
        );
    });
});
