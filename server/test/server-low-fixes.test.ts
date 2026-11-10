import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, sessions } from '../src/db/schema.js';
import {
    as,
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

describe('server low findings', () => {
    let ctx: TestCtx;
    let owner: TestUser;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
    });
    afterAll(async () => {
        await ctx.close();
    });

    it('answers 409 to a PATCH on a revoked share link, with no event and no audit row (SRV-038)', async () => {
        const id = await createDiagram(ctx.app, owner, 'd');
        const made = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${id}/share-links`,
            headers: as(owner),
            payload: { access: 'anyone' },
        });
        const link = made.json();
        await ctx.app.inject({
            method: 'DELETE',
            url: `/diagrams/${id}/share-links/${link.id}`,
            headers: as(owner),
        });
        const before = (await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'share.update'))).length;
        const res = await ctx.app.inject({
            method: 'PATCH',
            url: `/diagrams/${id}/share-links/${link.id}`,
            headers: as(owner),
            payload: { access: 'signed_in' },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ error: 'revoked' });
        const after = (await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'share.update'))).length;
        expect(after).toBe(before);
    });

    it('refuses a sign-in email longer than an address can be (SRV-041)', async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: `${'a'.repeat(250)}@example.com`, password: 'x' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('changing the password ends the other sessions (SRV-039)', async () => {
        const user = await registerUser(ctx.app, 'pw@example.com');
        const login = await ctx.app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'pw@example.com', password: 'Password-123!' },
        });
        expect(login.statusCode).toBe(200);
        // signing in ended the first session; this one is the only one
        expect((await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id))).length).toBe(1);
        const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/auth/change-password',
            headers: { cookie },
            payload: { currentPassword: 'Password-123!', newPassword: 'Another-Password-456!' },
        });
        expect(res.statusCode).toBe(200);
        // the session that changed it stays
        expect((await ctx.db.select().from(sessions).where(eq(sessions.userId, user.id))).length).toBe(1);
    });
});
