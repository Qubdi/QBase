import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMfa } from '../src/auth/mfa.js';
import {
    driftSettings,
    savedConnections,
    shareLinks,
    users,
} from '../src/db/schema.js';
import { CryptoBox } from '../src/introspect/crypto-box.js';
import { resealStoredSecrets } from '../src/reseal.js';
import {
    as,
    createDiagram,
    createTestApp,
    projectFor,
    registerUser,
    type TestCtx,
    type TestUser,
} from './helpers.js';

const CONNECTION_KEY = 'a-connection-key-of-32-characters!';
const SECRETS_KEY = 'a-secrets-key-of-32-characters-yes';

/** A value as the first format wrote it: scrypt, one fixed salt, optional purpose. */
function legacy(secret: string, purpose: string | undefined, plain: string) {
    const base = 'qubdidb-connection-box-v1';
    const key = scryptSync(secret, purpose ? `${base}:${purpose}` : base, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
        .join(':');
}

describe('re-sealing stored secrets', () => {
    let ctx: TestCtx;
    let owner: TestUser;
    let diagramId: string;
    let projectId: string;
    const keys = { secretsKey: SECRETS_KEY, connectionKey: CONNECTION_KEY };

    beforeAll(async () => {
        ctx = await createTestApp({ connectionKey: CONNECTION_KEY, secretsKey: SECRETS_KEY });
        owner = await registerUser(ctx.app, 'owner@example.com');
        projectId = await projectFor(ctx.app);
        diagramId = await createDiagram(ctx.app, owner);
    });
    afterAll(() => ctx.close());

    const shareLink = async () => {
        const res = await ctx.app.inject({
            method: 'POST',
            url: `/diagrams/${diagramId}/share-links`,
            headers: as(owner),
            payload: {},
        });
        return res.json() as { id: string; token: string };
    };

    it('does not let a purpose box open a value sealed with the shared key', () => {
        const old = legacy(SECRETS_KEY, undefined, 'x');
        expect(() => new CryptoBox(SECRETS_KEY, 'webhook').decrypt(old)).toThrow();
        expect(new CryptoBox(SECRETS_KEY).decrypt(old)).toBe('x');
    });

    it('writes every legacy value as v2, still readable, and does nothing the second time', async () => {
        // an authenticator secret sealed with its purpose key, v1
        await ctx.db
            .update(users)
            .set({ mfaSecretEnc: legacy(SECRETS_KEY, 'mfa', `${owner.id}:JBSWY3DPEHPK3PXP`) })
            .where(eq(users.id, owner.id));
        // a share-link token sealed with the shared key (before purposes), and one with its purpose
        const a = await shareLink();
        const b = await shareLink();
        await ctx.db.update(shareLinks).set({ tokenEnc: legacy(CONNECTION_KEY, undefined, a.token) }).where(eq(shareLinks.id, a.id));
        await ctx.db.update(shareLinks).set({ tokenEnc: legacy(CONNECTION_KEY, 'share-link', b.token) }).where(eq(shareLinks.id, b.id));
        // a saved connection password (no purpose) and a webhook sealed with the shared key
        const [conn] = await ctx.db
            .insert(savedConnections)
            .values({
                projectId,
                ownerId: owner.id,
                name: 'c',
                dialect: 'postgresql',
                host: 'db.example.com',
                port: 5432,
                database: 'd',
                username: 'u',
                passwordEnc: legacy(CONNECTION_KEY, undefined, 'hunter2'),
            })
            .returning();
        await ctx.db.insert(driftSettings).values({
            diagramId,
            connectionId: conn.id,
            webhookUrl: legacy(SECRETS_KEY, undefined, 'https://hooks.example.com/t0ken'),
        });

        const first = await resealStoredSecrets(ctx.db, keys);
        const by = Object.fromEntries(first.map((c) => [c.column, c]));
        expect(by['users.mfa_secret_enc']).toMatchObject({ resealed: 1, unreadable: 0 });
        expect(by['share_links.token_enc']).toMatchObject({ resealed: 2, unreadable: 0 });
        expect(by['saved_connections.password_enc']).toMatchObject({ resealed: 1, unreadable: 0 });
        expect(by['drift_settings.webhook_url']).toMatchObject({ resealed: 1, unreadable: 0 });

        const [u] = await ctx.db.select().from(users).where(eq(users.id, owner.id));
        expect(u.mfaSecretEnc).toMatch(/^v2:/);
        const mfa = createMfa(ctx.db, { secretsKey: SECRETS_KEY, mfaWindowSteps: 1 });
        expect(await mfa.secretOf(owner.id)).toBe('JBSWY3DPEHPK3PXP');

        const links = await ctx.db.select().from(shareLinks);
        const share = new CryptoBox(CONNECTION_KEY, 'share-link');
        expect(links.every((l) => l.tokenEnc?.startsWith('v3:'))).toBe(true);
        expect(share.decrypt(links.find((l) => l.id === a.id)!.tokenEnc!, a.id)).toBe(a.token);
        expect(share.decrypt(links.find((l) => l.id === b.id)!.tokenEnc!, b.id)).toBe(b.token);

        const [c] = await ctx.db.select().from(savedConnections).where(eq(savedConnections.id, conn.id));
        expect(c.passwordEnc).toMatch(/^v3:/);
        expect(new CryptoBox(CONNECTION_KEY).decrypt(c.passwordEnc, conn.id)).toBe('hunter2');

        const [d] = await ctx.db.select().from(driftSettings).where(eq(driftSettings.diagramId, diagramId));
        expect(d.webhookUrl).toMatch(/^v3:/);
        expect(new CryptoBox(SECRETS_KEY, 'webhook').decrypt(d.webhookUrl!, diagramId)).toBe('https://hooks.example.com/t0ken');

        // the second time there is nothing left to do
        const second = await resealStoredSecrets(ctx.db, keys);
        expect(second.every((c2) => c2.resealed === 0 && c2.unreadable === 0)).toBe(true);
    });

    it('leaves a value that the current key cannot open as it was, and counts it', async () => {
        const foreign = legacy('some-other-key-of-32-characters-ok', 'mfa', `${owner.id}:SEED`);
        await ctx.db.update(users).set({ mfaSecretEnc: foreign }).where(eq(users.id, owner.id));
        const done = await resealStoredSecrets(ctx.db, keys);
        expect(done.find((c) => c.column === 'users.mfa_secret_enc')).toMatchObject({ resealed: 0, unreadable: 1 });
        const [u] = await ctx.db.select().from(users).where(eq(users.id, owner.id));
        expect(u.mfaSecretEnc).toBe(foreign);
    });

    it('skips the columns whose key is not set', async () => {
        const done = await resealStoredSecrets(ctx.db, { secretsKey: null, connectionKey: null });
        expect(done).toEqual([]);
    });
});
