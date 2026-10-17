import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shareLinks } from '../src/db/schema.js';
import { checkLinkUsable } from '../src/share/access.js';
import { activeLinkSql, linkStatus } from '../src/share/active.js';
import {
    createDiagram,
    createTestApp,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const MINUTE = 60_000;

describe('which share links are active', () => {
    let ctx: TestCtx;
    let admin: TestUser;
    let diagramId: string;

    const make = async (
        access: 'anyone' | 'signed_in' | 'off',
        opts: { expiresInMinutes?: number | null; revoked?: boolean } = {}
    ) => {
        const [row] = await ctx.db
            .insert(shareLinks)
            .values({
                diagramId,
                tokenHash: randomUUID(),
                access,
                expiresAt:
                    opts.expiresInMinutes == null
                        ? null
                        : new Date(Date.now() + opts.expiresInMinutes * MINUTE),
                revokedAt: opts.revoked ? new Date() : null,
            })
            .returning();
        return row;
    };

    beforeAll(async () => {
        ctx = await createTestApp();
        admin = await registerUser(ctx.app, 'admin@example.com');
        diagramId = await createDiagram(ctx.app, admin);
    });
    afterAll(() => ctx.close());

    it('is the same answer in SQL as the rule the viewer is held to', async () => {
        const links = [
            await make('anyone'),
            await make('signed_in'),
            await make('anyone', { expiresInMinutes: 60 }),
            await make('anyone', { expiresInMinutes: -1 }), // expired
            await make('signed_in', { expiresInMinutes: -1 }),
            await make('off'),
            await make('off', { expiresInMinutes: 60 }),
            await make('anyone', { revoked: true }),
            await make('signed_in', { revoked: true }),
            await make('anyone', { revoked: true, expiresInMinutes: -1 }),
        ];

        // a signed-in visitor can open every link that can be opened at all
        const visitor = { id: admin.id, email: admin.email, isAdmin: true };
        const inCode = new Set(
            links
                .filter((l) => checkLinkUsable(l, visitor).ok)
                .map((l) => l.id)
        );
        const inSql = new Set(
            (
                await ctx.db
                    .select({ id: shareLinks.id })
                    .from(shareLinks)
                    .where(and(eq(shareLinks.diagramId, diagramId), activeLinkSql()))
            ).map((r) => r.id)
        );

        expect(inCode.size).toBeGreaterThan(0);
        expect(inCode.size).toBeLessThan(links.length);
        expect(inSql).toEqual(inCode);
        // and the status shown for a link agrees with both
        for (const l of links) {
            expect(linkStatus(l) === 'active', l.id).toBe(inCode.has(l.id));
        }
    });
});

describe('linkStatus', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE);

    it.each([
        ['active', { access: 'anyone', expiresAt: null, revokedAt: null }],
        ['active', { access: 'signed_in', expiresAt: at(5), revokedAt: null }],
        ['off', { access: 'off', expiresAt: null, revokedAt: null }],
        ['expired', { access: 'anyone', expiresAt: at(-5), revokedAt: null }],
        // the instant it expires is already too late, as checkLinkUsable has it
        ['expired', { access: 'anyone', expiresAt: now, revokedAt: null }],
        ['revoked', { access: 'anyone', expiresAt: null, revokedAt: at(-1) }],
    ] as const)('is %s', (expected, link) => {
        expect(linkStatus(link, now)).toBe(expected);
    });

    it('calls a link that is revoked, expired and off revoked, then expired, then off', () => {
        const link = {
            access: 'off' as const,
            expiresAt: at(-5),
            revokedAt: at(-1),
        };
        expect(linkStatus(link, now)).toBe('revoked');
        expect(linkStatus({ ...link, revokedAt: null }, now)).toBe('expired');
        expect(linkStatus({ ...link, revokedAt: null, expiresAt: null }, now)).toBe(
            'off'
        );
    });
});
