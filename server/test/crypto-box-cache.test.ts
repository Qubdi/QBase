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
    it('derives the key once per secret, however often it is asked', () => {
        const before = derived.calls;
        const first = cryptoBoxFor('a-secret-of-16-chars');
        for (let i = 0; i < 5; i++) {
            expect(cryptoBoxFor('a-secret-of-16-chars')).toBe(first);
        }
        expect(derived.calls - before).toBe(1);
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

    it('still opens values sealed before purposes existed', async () => {
        const { CryptoBox } = await import('../src/introspect/crypto-box.js');
        const old = new CryptoBox(secret).encrypt('https://hook.example/t0ken');
        expect(new CryptoBox(secret, 'webhook').decrypt(old)).toBe(
            'https://hook.example/t0ken'
        );
    });

    it('does not mix cached boxes of different purposes', () => {
        expect(cryptoBoxFor(secret, 'a')).not.toBe(cryptoBoxFor(secret, 'b'));
        expect(cryptoBoxFor(secret, 'a')).toBe(cryptoBoxFor(secret, 'a'));
    });
});
