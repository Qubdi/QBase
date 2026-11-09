import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { destroySession } from '../src/auth/sessions.js';
import { diagramLocks, sessions } from '../src/db/schema.js';
import { hashToken } from '../src/share/tokens.js';
import { createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('ending a session', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let diagramId: string;
    const tokenOf = (u: TestUser) => u.cookie.split('=')[1];
    const sessionRows = (u: TestUser) => ctx.db.select().from(sessions).where(eq(sessions.id, hashToken(tokenOf(u))));
    const lockRows = (u: TestUser) => ctx.db.select().from(diagramLocks).where(eq(diagramLocks.userId, u.id));
    const hold = (u: TestUser) =>
        ctx.db.insert(diagramLocks).values({ diagramId, userId: u.id, editorId: 'tab-1', expiresAt: new Date(Date.now() + 60_000) });

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        diagramId = await createDiagram(ctx.app, admin, 'Held');
    });
    afterAll(() => ctx.close());

    it('removes the session and lets go of the diagrams held', async () => {
        const user = await registerUser(ctx.app, 'a@example.com');
        await hold(user);
        await destroySession(ctx.db, tokenOf(user));
        expect(await sessionRows(user)).toHaveLength(0);
        expect(await lockRows(user)).toHaveLength(0);
    });

    it('keeps the session when the locks cannot be released, so nothing is half done', async () => {
        const user = await registerUser(ctx.app, 'b@example.com');
        await hold(user);
        await ctx.db.execute(sql`
            create function refuse_lock_delete() returns trigger language plpgsql as
            $$ begin raise exception 'refused'; end $$`);
        await ctx.db.execute(sql`
            create trigger refuse_lock_delete before delete on diagram_locks
            for each row execute function refuse_lock_delete()`);
        try {
            await expect(destroySession(ctx.db, tokenOf(user))).rejects.toThrow();
            expect(await sessionRows(user)).toHaveLength(1);
            expect(await lockRows(user)).toHaveLength(1);
        } finally {
            await ctx.db.execute(sql`drop trigger refuse_lock_delete on diagram_locks`);
            await ctx.db.execute(sql`drop function refuse_lock_delete()`);
        }
    });
});
