import { describe, expect, it } from 'vitest';
import { loadConfig, parseCookieSecure, parseTrustProxy } from '../src/config.js';

describe('parseTrustProxy', () => {
    it('trusts nothing by default', () => {
        expect(parseTrustProxy(undefined)).toBe(false);
        expect(parseTrustProxy('')).toBe(false);
        expect(parseTrustProxy('false')).toBe(false);
    });

    it('reads true, a hop count or an address list', () => {
        expect(parseTrustProxy('true')).toBe(true);
        expect(parseTrustProxy('2')).toBe(2);
        expect(parseTrustProxy('10.0.0.1, 192.168.0.0/16')).toEqual([
            '10.0.0.1',
            '192.168.0.0/16',
        ]);
    });

    it('is part of the loaded config', () => {
        expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    });
});

describe('parseCookieSecure', () => {
    it('reads true and false, and falls back to auto', () => {
        expect(parseCookieSecure('true')).toBe(true);
        expect(parseCookieSecure(' FALSE ')).toBe(false);
        expect(parseCookieSecure(undefined)).toBe('auto');
        expect(parseCookieSecure('')).toBe('auto');
        expect(parseCookieSecure('auto')).toBe('auto');
        expect(parseCookieSecure('yes')).toBe('auto');
    });
});
