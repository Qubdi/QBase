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
