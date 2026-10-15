import { describe, expect, it } from 'vitest';
import { loadConfig, parseTrustProxy } from '../src/config.js';

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
