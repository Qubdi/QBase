import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { driftSettings } from '../src/db/schema.js';
import { resealPlaintextWebhooks } from '../src/drift/reseal.js';
import { openWebhookUrl } from '../src/drift/webhook.js';
import { cryptoBoxFor } from '../src/introspect/crypto-box.js';
import { createDiagram, createTestApp, registerUser, type TestCtx, type TestUser } from './helpers.js';

const KEY = 'a-secrets-key-of-32-characters-yes';

describe('sealing webhook URLs saved in plain text', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    const urlOf = async (diagramId: string) =>
        (await ctx.db.select().from(driftSettings).where(eq(driftSettings.diagramId, diagramId)))[0].webhookUrl;

    beforeAll(async () => {
        ctx = await createTestApp();
        owner = await registerUser(ctx.app, 'owner@example.com');
    });
    afterAll(() => ctx.close());

    it('seals each plain URL, leaves sealed and empty ones alone, and counts only what it changed', async () => {
        const plain = await createDiagram(ctx.app, owner, 'plain');
        const sealed = await createDiagram(ctx.app, owner, 'sealed');
        const none = await createDiagram(ctx.app, owner, 'none');
        const box = cryptoBoxFor(KEY, 'webhook');
        const already = box.encrypt('https://hooks.example.com/already');
        await ctx.db.insert(driftSettings).values([
            { diagramId: plain, webhookUrl: 'https://hooks.example.com/secret-token' },
            { diagramId: sealed, webhookUrl: already },
            { diagramId: none, webhookUrl: null },
        ]);

        expect(await resealPlaintextWebhooks(ctx.db, KEY)).toBe(1);

        const now = (await urlOf(plain))!;
        expect(now).toMatch(/^v2:/);
        // the token no longer sits in the table, and the URL still opens
        expect(now).not.toContain('secret-token');
        expect(openWebhookUrl(box, now)).toBe('https://hooks.example.com/secret-token');
        expect(await urlOf(sealed)).toBe(already);
        expect(await urlOf(none)).toBeNull();
    });

    it('is safe to run again: nothing left to seal', async () => {
        expect(await resealPlaintextWebhooks(ctx.db, KEY)).toBe(0);
    });

    it('does not touch a row that changed after it was read', async () => {
        const raced = await createDiagram(ctx.app, owner, 'raced');
        await ctx.db.insert(driftSettings).values({ diagramId: raced, webhookUrl: 'https://hooks.example.com/one' });
        // a second run at the same moment (another replica) sealing the same row
        const [a, b] = await Promise.all([
            resealPlaintextWebhooks(ctx.db, KEY),
            resealPlaintextWebhooks(ctx.db, KEY),
        ]);
        expect(a + b).toBe(1);
        const box = cryptoBoxFor(KEY, 'webhook');
        expect(openWebhookUrl(box, (await urlOf(raced))!)).toBe('https://hooks.example.com/one');
    });
});
