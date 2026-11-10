import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { diagrams } from '../src/db/schema.js';
import { audit } from '../src/audit/audit.js';
import { createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

describe('an audit row that cannot be written after the action is done', () => {
    let ctx: TestCtx;
    let admin: TestUser;

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    const withBrokenAudit = async <T>(run: () => Promise<T>): Promise<T> => {
        await ctx.db.execute(sql`ALTER TABLE audit_log RENAME TO audit_log_away`);
        try {
            return await run();
        } finally {
            await ctx.db.execute(sql`ALTER TABLE audit_log_away RENAME TO audit_log`);
        }
    };

    it('is logged with the request id and does not fail a plain-db action', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            // createDiagram audits with the plain db after the row is stored
            const id = await withBrokenAudit(() => createDiagram(ctx.app, admin, 'Made while the log was broken'));
            expect(id).not.toBe('');
            const lines = log.mock.calls.map((c) => String(c[0]));
            expect(lines.some((l) => l.includes('Audit row lost (diagram.create)') && l.includes('[request '))).toBe(true);
            expect(await ctx.db.select().from(diagrams).where(eq(diagrams.id, id))).toHaveLength(1);
        } finally {
            log.mockRestore();
        }
    });

    it('still fails an action whose audit row is part of its transaction', async () => {
        await expect(
            withBrokenAudit(() =>
                ctx.db.transaction(async (tx) => {
                    await audit(tx, { userId: admin.id, action: 'user.sign_in' });
                })
            )
        ).rejects.toThrow();
    });

    it('is swallowed and logged on the plain db', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await withBrokenAudit(() => audit(ctx.db, { userId: admin.id, action: 'user.sign_in' }));
            expect(log).toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
