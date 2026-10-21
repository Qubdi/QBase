import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client.js';

const made = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/introspect/crypto-box.js', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/introspect/crypto-box.js')>();
    return {
        ...real,
        CryptoBox: class extends real.CryptoBox {
            constructor(secret: string) {
                super(secret);
                made.count++;
            }
        },
    };
});

const { createMfa } = await import('../src/auth/mfa.js');

describe('two-factor secret sealing', () => {
    it('derives its key once, not on every operation', async () => {
        const db = { update: () => ({ set: () => ({ where: async () => undefined }) }) } as unknown as Db;
        const mfa = createMfa(db, { secretsKey: 'a-test-key-of-at-least-16-chars', mfaWindowSteps: 1 });
        await mfa.storePendingSecret('user-1', 'JBSWY3DPEHPK3PXP');
        await mfa.storePendingSecret('user-2', 'JBSWY3DPEHPK3PXP');
        await mfa.storePendingSecret('user-1', 'JBSWY3DPEHPK3PXP');
        expect(made.count).toBe(1);
    });
});
