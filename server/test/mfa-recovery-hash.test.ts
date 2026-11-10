import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMfa } from '../src/auth/mfa.js';
import { createHash } from 'node:crypto';
import { hashRecoveryCode } from '../src/auth/totp.js';
import { mfaRecoveryCodes } from '../src/db/schema.js';
import { createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';
/** A recovery code stored the way the oldest versions did: the bare sha256. */
const bareSha256 = (code: string) =>
    createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
/** One stored as an HMAC without the version prefix. */
const unprefixed = (code: string) => hashRecoveryCode(code, KEY).slice('k1:'.length);

describe('recovery code storage', () => {
    let ctx: TestCtx;
    let user: TestUser;
    const mfa = () => createMfa(ctx.db, { secretsKey: KEY, mfaWindowSteps: 1 });
    const stored = async () =>
        (await ctx.db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id))).map((r) => r.codeHash);

    beforeAll(async () => {
        ctx = await createTestApp({ secretsKey: KEY });
        user = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    it('stores new codes keyed and prefixed, not as the plain sha256 of the code', async () => {
        const codes = await mfa().renewRecoveryCodes(user.id);
        const hashes = await stored();
        expect(hashes).toHaveLength(codes.length);
        for (const code of codes) expect(hashes).not.toContain(bareSha256(code));
        for (const hash of hashes) expect(hash).toMatch(/^k1:[0-9a-f]{64}$/);
        // and they still work, once each
        expect(await mfa().spendRecoveryCode(user.id, codes[0])).toBe(true);
        expect(await mfa().spendRecoveryCode(user.id, codes[0])).toBe(false);
    });

    it('no longer accepts a code stored the old way, as a bare sha256 or an unprefixed hash', async () => {
        await ctx.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
        await ctx.db.insert(mfaRecoveryCodes).values([
            { userId: user.id, codeHash: bareSha256('ABCDE-FGHJK') },
            { userId: user.id, codeHash: unprefixed('KMNPQ-RSTUV') },
        ]);
        expect(await mfa().spendRecoveryCode(user.id, 'abcde fghjk')).toBe(false);
        expect(await mfa().spendRecoveryCode(user.id, 'KMNPQ-RSTUV')).toBe(false);
    });

    it('does not accept a code under a different key', async () => {
        const codes = await mfa().renewRecoveryCodes(user.id);
        const other = createMfa(ctx.db, { secretsKey: 'another-key-of-at-least-16-chars', mfaWindowSteps: 1 });
        expect(await other.spendRecoveryCode(user.id, codes[1])).toBe(false);
    });

    it('leaves exactly one set of codes when several renewals run at once', async () => {
        const sets = await Promise.all(Array.from({ length: 8 }, () => mfa().renewRecoveryCodes(user.id)));
        const hashes = await stored();
        // one renewal won; the codes of the others no longer exist
        expect(hashes).toHaveLength(sets[0].length);
        const live = await Promise.all(
            sets.map(async (codes) => (await mfa().spendRecoveryCode(user.id, codes[0])) ? 1 : 0)
        );
        expect(live.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    });

    it('enables two-factor and stores its codes together, or neither', async () => {
        await ctx.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
        // the second write of enable() fails: the codes written before it must not stay
        await ctx.db.execute(sql`
            create function refuse_mfa_enable() returns trigger language plpgsql as
            $$ begin raise exception 'refused'; end $$`);
        await ctx.db.execute(sql`
            create trigger refuse_mfa_enable before update of mfa_enabled_at on users
            for each row execute function refuse_mfa_enable()`);
        try {
            await expect(mfa().enable(user.id)).rejects.toThrow();
            expect(await stored()).toHaveLength(0);
        } finally {
            await ctx.db.execute(sql`drop trigger refuse_mfa_enable on users`);
            await ctx.db.execute(sql`drop function refuse_mfa_enable()`);
        }
    });
});
