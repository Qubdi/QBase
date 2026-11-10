import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const derived = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
    const real = await importOriginal<typeof import('node:crypto')>();
    return {
        ...real,
        scryptSync: (...args: Parameters<typeof real.scryptSync>) => {
            derived.calls++;
            return real.scryptSync(...args);
        },
    };
});

const { cryptoBoxFor } = await import('../src/introspect/crypto-box.js');

describe('cryptoBoxFor', () => {
    it('makes one box per secret, however often it is asked', () => {
        const first = cryptoBoxFor('a-secret-of-16-chars');
        for (let i = 0; i < 5; i++) {
            expect(cryptoBoxFor('a-secret-of-16-chars')).toBe(first);
        }
    });

    it('never runs scrypt for the format it writes, and only once for the old one', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const before = derived.calls;
        const box = new CryptoBox('a-secret-of-32-chars-or-more-yes!');
        for (let i = 0; i < 5; i++) expect(box.decrypt(box.encrypt('x'))).toBe('x');
        expect(derived.calls - before).toBe(0);
    });

    it('keeps secrets apart', () => {
        const a = cryptoBoxFor('first-secret-16-chars');
        const b = cryptoBoxFor('second-secret-16-chars');
        expect(a).not.toBe(b);
        expect(() => b.decrypt(a.encrypt('hunter2'))).toThrow();
        expect(a.decrypt(a.encrypt('hunter2'))).toBe('hunter2');
    });

    it('still refuses a short secret', () => {
        expect(() => cryptoBoxFor('short')).toThrow(/at least 16/);
    });
});

/** A value as the old format wrote it: scrypt key, fixed salt, optional purpose. */
function legacyV1(secret: string, purpose: string | undefined, plain: string): string {
    const base = 'qubdidb-connection-box-v1';
    const key = scryptSync(secret, purpose ? `${base}:${purpose}` : base, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64'))).join(':');
}

describe('CryptoBox purposes', () => {
    const secret = 'purpose-secret-16-chars';

    it('keeps one purpose from opening another purpose or the bare box', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const mfa = new CryptoBox(secret, 'mfa');
        const hook = new CryptoBox(secret, 'webhook');
        const bare = new CryptoBox(secret);
        const sealed = mfa.encrypt('seed');
        expect(mfa.decrypt(sealed)).toBe('seed');
        expect(() => hook.decrypt(sealed)).toThrow();
        expect(() => bare.decrypt(sealed)).toThrow();
    });

    it('no longer opens a value sealed before purposes existed through a purpose box', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const old = legacyV1(secret, undefined, 'https://hook.example/t0ken');
        expect(() => new CryptoBox(secret, 'webhook').decrypt(old)).toThrow();
        // the start-up re-seal opens it with the shared key and writes it again
        expect(new CryptoBox(secret, 'webhook').decryptLegacyShared(old)).toBe(
            'https://hook.example/t0ken'
        );
    });

    it('opens values in the v1 format under their own purpose', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const old = legacyV1(secret, 'mfa', 'seed');
        expect(new CryptoBox(secret, 'mfa').decrypt(old)).toBe('seed');
    });

    it('writes v2 with a fresh salt for every value', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const box = new CryptoBox(secret, 'mfa');
        const a = box.encrypt('same').split(':');
        const b = box.encrypt('same').split(':');
        expect(a[0]).toBe('v2');
        expect(a).toHaveLength(5);
        expect(a[1]).not.toBe(b[1]);
        expect(a[4]).not.toBe(b[4]);
    });

    it('does not mix cached boxes of different purposes', () => {
        expect(cryptoBoxFor(secret, 'a')).not.toBe(cryptoBoxFor(secret, 'b'));
        expect(cryptoBoxFor(secret, 'a')).toBe(cryptoBoxFor(secret, 'a'));
    });
});
