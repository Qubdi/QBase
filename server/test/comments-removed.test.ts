import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_GROUPS } from '../src/audit/audit.js';
import { as, createTestApp, registerUser, type TestCtx } from './helpers.js';

// The comments feature was removed (migration 0018_drop_comments): nothing of it
// is left to call, log or filter by.

describe('comments are gone', () => {
    let ctx: TestCtx;
    beforeAll(async () => {
        ctx = await createTestApp();
    });
    afterAll(() => ctx.close());

    it('has no comment routes on share links', () => {
        for (const method of [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
        ] as const) {
            for (const url of [
                '/s/:token/comments',
                '/s/:token/comments/:commentId',
                '/s/:token/comments/:commentId/resolve',
            ]) {
                expect(
                    ctx.app.hasRoute({ method, url }),
                    `${method} ${url}`
                ).toBe(false);
            }
        }
    });

    it('logs and filters no comment actions', () => {
        expect(AUDIT_ACTIONS.filter((a) => a.startsWith('comment.'))).toEqual(
            []
        );
        expect(Object.keys(AUDIT_GROUPS)).not.toContain('comments');
    });

    it('refuses the removed filter group', async () => {
        const admin = await registerUser(ctx.app, 'admin@example.com');
        const res = await ctx.app.inject({
            url: '/admin/audit?group=comments',
            headers: as(admin),
        });
        expect(res.statusCode).toBe(400);
    });
});
