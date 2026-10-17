import { describe, expect, it } from 'vitest';
import type { AdminShareLink } from '../api';
import {
    ACCESS_LABEL,
    canRevoke,
    expiryText,
    STATUS_LABEL,
} from '../share-links';

const now = new Date('2026-10-16T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('expiryText', () => {
    it('says a link never expires when it has no end', () => {
        expect(expiryText({ expiresAt: null, revokedAt: null }, now)).toBe(
            'Never expires'
        );
    });

    it('says when a link will stop', () => {
        expect(
            expiryText({ expiresAt: at(3 * DAY), revokedAt: null }, now)
        ).toBe('Expires in 3 days');
        expect(
            expiryText({ expiresAt: at(2 * HOUR), revokedAt: null }, now)
        ).toBe('Expires in 2 hours');
    });

    it('says when a link stopped', () => {
        expect(
            expiryText({ expiresAt: at(-2 * DAY), revokedAt: null }, now)
        ).toBe('Expired 2 days ago');
    });

    it('says an expiry that is exactly now has already passed', () => {
        expect(expiryText({ expiresAt: at(0), revokedAt: null }, now)).toMatch(
            /^Expired/
        );
    });

    it('says when it was revoked, whatever its expiry', () => {
        expect(
            expiryText(
                { expiresAt: at(3 * DAY), revokedAt: at(-3 * HOUR) },
                now
            )
        ).toBe('Revoked 3 hours ago');
        expect(
            expiryText({ expiresAt: null, revokedAt: at(-3 * HOUR) }, now)
        ).toBe('Revoked 3 hours ago');
    });
});

describe('canRevoke', () => {
    it.each([
        ['active', true],
        ['off', true], // the editors can switch it back on
        ['expired', true], // or give it a new end
        ['revoked', false], // nothing left to end
    ] as const)('%s: %s', (status, expected) => {
        expect(canRevoke({ status })).toBe(expected);
    });
});

describe('labels', () => {
    it('has one for every access and status the server can send', () => {
        const access: AdminShareLink['access'][] = [
            'anyone',
            'signed_in',
            'off',
        ];
        for (const a of access)
            expect(ACCESS_LABEL[a].length).toBeGreaterThan(0);
        for (const s of ['active', 'off', 'expired', 'revoked'] as const) {
            expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
        }
    });
});
