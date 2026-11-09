import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMfa } from '../src/auth/mfa.js';
import { mfaChallenges } from '../src/db/schema.js';
import { createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

const KEY = 'a-test-key-of-at-least-16-chars';

describe('one pending sign-in per account', () => {
    let ctx: TestCtx;
    let user: TestUser;
    const mfa = () => createMfa(ctx.db, { secretsKey: KEY, mfaWindowSteps: 1 });
    const rows = () => ctx.db.select().from(mfaChallenges).where(eq(mfaChallenges.userId, user.id));

    beforeAll(async () => {
        ctx = await createTestApp({ secretsKey: KEY });
        user = await registerUser(ctx.app, 'admin@example.com');
    });
    afterAll(() => ctx.close());

    it('replaces the earlier challenge, which then stops working', async () => {
        const first = await mfa().createChallenge(user.id);
        const second = await mfa().createChallenge(user.id);
        expect(await rows()).toHaveLength(1);
        expect(await mfa().useAttempt(first)).toBeNull();
        expect(await mfa().useAttempt(second)).toMatchObject({ userId: user.id });
    });

    it('starts the new challenge with no wrong attempts counted', async () => {
        const first = await mfa().createChallenge(user.id);
        await mfa().useAttempt(first);
        await mfa().createChallenge(user.id);
        expect((await rows())[0].attempts).toBe(0);
    });

    it('leaves one challenge when several logins start at once', async () => {
        const tickets = await Promise.all(Array.from({ length: 8 }, () => mfa().createChallenge(user.id)));
        expect(await rows()).toHaveLength(1);
        const live = await Promise.all(tickets.map(async (t) => ((await mfa().useAttempt(t)) ? 1 : 0)));
        expect(live.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    });
});
