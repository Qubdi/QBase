import { describe, expect, it } from 'vitest';
import { checkLinkUsable, type ShareLinkRow } from '../src/share/access.js';
import {
    generateToken,
    hashToken,
    isWellFormedToken,
} from '../src/share/tokens.js';

const link = (over: Partial<ShareLinkRow> = {}): ShareLinkRow => ({
    id: 'l1',
    diagramId: 'd1',
    tokenHash: 'h',
    access: 'anyone',
    expiresAt: null,
    live: false,
    createdBy: null,
    createdAt: new Date('2025-01-01'),
    revokedAt: null,
    ...over,
});
const user = { id: 'u', email: 'u@x.co', isAdmin: false };
const now = new Date('2026-01-01T00:00:00Z');

describe('tokens', () => {
    it('are 128-bit, URL-safe and unique', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const t = generateToken();
            expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
            expect(isWellFormedToken(t)).toBe(true);
            seen.add(t);
        }
        expect(seen.size).toBe(200);
    });

    it('hash deterministically and never equal the raw token', () => {
        const t = generateToken();
        expect(hashToken(t)).toBe(hashToken(t));
        expect(hashToken(t)).not.toBe(t);
        expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects malformed tokens', () => {
        for (const bad of ['', 'short', 'x'.repeat(23), 'a'.repeat(21) + '!', '../etc/passwd']) {
            expect(isWellFormedToken(bad)).toBe(false);
        }
    });
});

describe('checkLinkUsable', () => {
    it('allows an open link for anonymous visitors', () => {
        expect(checkLinkUsable(link(), null, now).ok).toBe(true);
    });

    it('hides missing, revoked, expired and disabled links as not_found', () => {
        expect(checkLinkUsable(undefined, null, now)).toEqual({
            ok: false,
            reason: 'not_found',
        });
        expect(
            checkLinkUsable(link({ revokedAt: new Date('2025-06-01') }), null, now)
        ).toMatchObject({ ok: false, reason: 'not_found' });
        expect(
            checkLinkUsable(link({ expiresAt: new Date('2025-12-31') }), null, now)
        ).toMatchObject({ ok: false, reason: 'not_found' });
        expect(
            checkLinkUsable(link({ access: 'off' }), user, now)
        ).toMatchObject({ ok: false, reason: 'not_found' });
    });

    it('treats the expiry instant itself as expired and the future as valid', () => {
        expect(checkLinkUsable(link({ expiresAt: now }), null, now).ok).toBe(false);
        expect(
            checkLinkUsable(link({ expiresAt: new Date('2026-01-02') }), null, now).ok
        ).toBe(true);
    });

    it('asks anonymous visitors to sign in when required', () => {
        const l = link({ access: 'signed_in' });
        expect(checkLinkUsable(l, null, now)).toEqual({
            ok: false,
            reason: 'login_required',
        });
        expect(checkLinkUsable(l, user, now).ok).toBe(true);
    });
});
