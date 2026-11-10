import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditDiagramSave } from '../src/audit/audit.js';
import { auditLog } from '../src/db/schema.js';
import { createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('the save audit throttle', () => {
    let ctx: TestCtx;
    let user: TestUser;
    let diagramId: string;
    const rows = async () =>
        (await ctx.db.select().from(auditLog).where(eq(auditLog.diagramId, diagramId))).filter(
            (r) => r.action === 'diagram.update'
        );

    beforeAll(async () => {
        ctx = await createTestApp();
        user = await registerUser(ctx.app, 'admin@example.com');
        diagramId = await createDiagram(ctx.app, user, 'Saved often');
        await ctx.db.delete(auditLog);
    });
    afterAll(() => ctx.close());

    it('writes one row for saves that arrive at the same moment', async () => {
        // repeated: one lucky interleaving must not hide a race
        for (let round = 0; round < 15; round++) {
            await ctx.db.delete(auditLog);
            await Promise.all(
                Array.from({ length: 10 }, () => auditDiagramSave(ctx.db, { userId: user.id, diagramId }, 5))
            );
            expect(await rows(), `round ${round}`).toHaveLength(1);
        }
    });

    it('writes a row for every save when the interval is 0', async () => {
        await ctx.db.delete(auditLog);
        for (let i = 0; i < 3; i++) await auditDiagramSave(ctx.db, { userId: user.id, diagramId }, 0);
        expect(await rows()).toHaveLength(3);
    });
});
