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

describe('two-factor settings', () => {
    it('is on by default, with a window of one step', () => {
        const c = loadConfig({});
        expect(c.mfaEnabled).toBe(true);
        expect(c.mfaWindowSteps).toBe(1);
    });

    it('MFA_ENABLED=false switches it off', () => {
        expect(loadConfig({ MFA_ENABLED: 'false' }).mfaEnabled).toBe(false);
    });

    it('reads the window and ignores nonsense', () => {
        expect(loadConfig({ MFA_WINDOW_STEPS: '2' }).mfaWindowSteps).toBe(2);
        expect(loadConfig({ MFA_WINDOW_STEPS: '0' }).mfaWindowSteps).toBe(0);
        expect(loadConfig({ MFA_WINDOW_STEPS: '-1' }).mfaWindowSteps).toBe(1);
        expect(loadConfig({ MFA_WINDOW_STEPS: 'x' }).mfaWindowSteps).toBe(1);
    });

    it('encrypts with SECRETS_KEY, else the connection key, else nothing', () => {
        expect(loadConfig({}).secretsKey).toBeNull();
        expect(loadConfig({ CONNECTION_KEY: 'c'.repeat(20) }).secretsKey).toBe('c'.repeat(20));
        expect(
            loadConfig({ CONNECTION_KEY: 'c'.repeat(20), SECRETS_KEY: 's'.repeat(20) }).secretsKey
        ).toBe('s'.repeat(20));
    });
});
