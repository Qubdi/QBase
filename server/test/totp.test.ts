import { describe, expect, it } from 'vitest';
import {
    base32Decode,
    base32Encode,
    generateRecoveryCodes,
    generateSecret,
    hashRecoveryCode,
    hotp,
    normalizeRecoveryCode,
    otpauthUrl,
    stepAt,
    totp,
    verifyTotp,
} from '../src/auth/totp.js';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string below
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp: RFC 6238 test vectors (SHA-1, 8 digits)', () => {
    const vectors: [number, string][] = [
        [59, '94287082'],
        [1111111109, '07081804'],
        [1111111111, '14050471'],
        [1234567890, '89005924'],
        [2000000000, '69279037'],
        [20000000000, '65353130'],
    ];
    for (const [seconds, expected] of vectors) {
        it(`T=${seconds}`, () => {
            expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
        });
    }
});

describe('hotp: RFC 4226 test vectors', () => {
    it('counters 0 to 9', () => {
        const key = Buffer.from('12345678901234567890');
        const expected = [
            '755224', '287082', '359152', '969429', '338314',
            '254676', '287922', '162583', '399871', '520489',
        ];
        expected.forEach((code, counter) => expect(hotp(key, counter)).toBe(code));
    });
});

describe('base32', () => {
    it('round-trips, and reads lowercase, spaces and dashes', () => {
        const bytes = Buffer.from([1, 2, 3, 250, 251, 252, 0, 99]);
        const text = base32Encode(bytes);
        expect(base32Decode(text)).toEqual(bytes);
        const typed = text.toLowerCase().replace(/(.{4})/g, '$1 ');
        expect(base32Decode(typed)).toEqual(bytes);
    });

    it('matches the RFC 4648 vector', () => {
        expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    });

    it('refuses other characters', () => {
        expect(() => base32Decode('abc1')).toThrow();
    });

    it('makes a 32-character secret of 160 bits', () => {
        const s = generateSecret();
        expect(s).toMatch(/^[A-Z2-7]{32}$/);
        expect(base32Decode(s)).toHaveLength(20);
        expect(generateSecret()).not.toBe(s);
    });
});

describe('otpauthUrl', () => {
    it('carries the secret, issuer and the account', () => {
        const url = new URL(
            otpauthUrl({ secret: 'ABC234', account: 'a+b@example.com', issuer: 'Qubdi DB' })
        );
        expect(url.protocol).toBe('otpauth:');
        expect(url.host).toBe('totp');
        expect(decodeURIComponent(url.pathname)).toBe('/Qubdi DB:a+b@example.com');
        expect(url.searchParams.get('secret')).toBe('ABC234');
        expect(url.searchParams.get('issuer')).toBe('Qubdi DB');
        expect(url.searchParams.get('digits')).toBe('6');
        expect(url.searchParams.get('period')).toBe('30');
    });
});

describe('verifyTotp', () => {
    const secret = generateSecret();
    const now = 1_800_000_000_000;
    const at = (steps: number) => totp(secret, now + steps * 30_000);

    it('accepts the current code and one step either side', () => {
        for (const d of [-1, 0, 1]) {
            const r = verifyTotp({ secret, code: at(d), now, windowSteps: 1 });
            expect(r).toEqual({ ok: true, step: stepAt(now) + d });
        }
    });

    it('rejects two steps away', () => {
        expect(verifyTotp({ secret, code: at(2), now, windowSteps: 1 }).ok).toBe(false);
        expect(verifyTotp({ secret, code: at(-2), now, windowSteps: 1 }).ok).toBe(false);
    });

    it('a wider window accepts more, and 0 accepts only the current step', () => {
        expect(verifyTotp({ secret, code: at(2), now, windowSteps: 2 }).ok).toBe(true);
        expect(verifyTotp({ secret, code: at(1), now, windowSteps: 0 }).ok).toBe(false);
        expect(verifyTotp({ secret, code: at(0), now, windowSteps: 0 }).ok).toBe(true);
    });

    it('does not accept the same step twice, nor an older one', () => {
        const first = verifyTotp({ secret, code: at(0), now, windowSteps: 1 });
        expect(first.ok).toBe(true);
        const step = first.ok ? first.step : 0;
        expect(verifyTotp({ secret, code: at(0), now, windowSteps: 1, lastStep: step }).ok).toBe(false);
        expect(verifyTotp({ secret, code: at(-1), now, windowSteps: 1, lastStep: step }).ok).toBe(false);
        expect(verifyTotp({ secret, code: at(1), now, windowSteps: 1, lastStep: step }).ok).toBe(true);
    });

    it('ignores spaces in the typed code and refuses anything not six digits', () => {
        const code = at(0);
        expect(verifyTotp({ secret, code: `${code.slice(0, 3)} ${code.slice(3)}`, now, windowSteps: 1 }).ok).toBe(true);
        for (const bad of ['', '12345', '1234567', 'abcdef', '12345a']) {
            expect(verifyTotp({ secret, code: bad, now, windowSteps: 1 }).ok).toBe(false);
        }
    });
});

describe('recovery codes', () => {
    it('makes ten distinct codes that look like ABCDE-FGHJK', () => {
        const codes = generateRecoveryCodes();
        expect(codes).toHaveLength(10);
        expect(new Set(codes).size).toBe(10);
        for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    });

    it('hashes the same whatever the case, spaces or dash', () => {
        expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
        expect(hashRecoveryCode('abcde fghjk')).toBe(hashRecoveryCode('ABCDE-FGHJK'));
        expect(hashRecoveryCode('ABCDE-FGHJK')).toMatch(/^[0-9a-f]{64}$/);
        expect(hashRecoveryCode('ABCDE-FGHJK')).not.toBe(hashRecoveryCode('ABCDE-FGHJM'));
    });
});
