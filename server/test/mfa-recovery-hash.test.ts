import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMfa } from '../src/auth/mfa.js';
import { legacyHashRecoveryCode } from '../src/auth/totp.js';
import { mfaRecoveryCodes } from '../src/db/schema.js';
import { createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';

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

    it('stores new codes keyed, not as the plain sha256 of the code', async () => {
        const codes = await mfa().renewRecoveryCodes(user.id);
        const hashes = await stored();
        expect(hashes).toHaveLength(codes.length);
        for (const code of codes) expect(hashes).not.toContain(legacyHashRecoveryCode(code));
        // and they still work, once each
        expect(await mfa().spendRecoveryCode(user.id, codes[0])).toBe(true);
        expect(await mfa().spendRecoveryCode(user.id, codes[0])).toBe(false);
    });

    it('still accepts a code stored the old way, once', async () => {
        await ctx.db.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
        await ctx.db.insert(mfaRecoveryCodes).values({ userId: user.id, codeHash: legacyHashRecoveryCode('ABCDE-FGHJK') });
        expect(await mfa().spendRecoveryCode(user.id, 'abcde fghjk')).toBe(true);
        expect(await mfa().spendRecoveryCode(user.id, 'ABCDE-FGHJK')).toBe(false);
    });

    it('does not accept a code under a different key', async () => {
        const codes = await mfa().renewRecoveryCodes(user.id);
        const other = createMfa(ctx.db, { secretsKey: 'another-key-of-at-least-16-chars', mfaWindowSteps: 1 });
        expect(await other.spendRecoveryCode(user.id, codes[1])).toBe(false);
    });
});
