import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    ConfigError,
    loadConfig as loadConfigFrom,
    parseCookieSecure,
    parseTrustProxy,
} from '../src/config.js';

/** `loadConfig` with the one setting that has no default. */
const loadConfig = (env: NodeJS.ProcessEnv = {}) =>
    loadConfigFrom({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', ...env });

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
        expect(loadConfig({ TRUST_PROXY: '10.0.0.1' }).trustProxy).toEqual([
            '10.0.0.1',
        ]);
        expect(loadConfig({}).trustProxy).toBe(false);
    });

    it('refuses true, which would believe a header any visitor can send', () => {
        expect(() => loadConfig({ TRUST_PROXY: 'true' })).toThrow(ConfigError);
        expect(() => loadConfig({ TRUST_PROXY: ' true ' })).toThrow(
            /TRUST_PROXY=true trusts an X-Forwarded-For header/
        );
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

describe('boot-time validation', () => {
    it('refuses a numeric setting that is not a whole number in range', () => {
        for (const env of [
            { AUTH_MAX_FAILURES: 'ten' },
            { AUTH_MAX_FAILURES: '0' },
            { AUTH_LOCKOUT_MINUTES: '1.5' },
            { PORT: '70000' },
            { DB_POOL_MAX: '-3' },
            { SESSION_DAYS: 'NaN' },
            { PASSWORD_MIN_LENGTH: 'abc' },
        ]) {
            expect(() => loadConfig(env), JSON.stringify(env)).toThrow(ConfigError);
        }
    });

    it('names every bad setting at once', () => {
        expect(() => loadConfig({ PORT: 'x', SESSION_DAYS: 'y' })).toThrow(/PORT[\s\S]*SESSION_DAYS/);
    });

    it('treats an empty value as unset and keeps valid numbers', () => {
        const c = loadConfig({ AUTH_MAX_FAILURES: '', PORT: '8080', SNAPSHOT_KEEP: '0' });
        expect(c.authMaxFailures).toBe(10);
        expect(c.port).toBe(8080);
        expect(c.snapshotKeep).toBe(0);
    });

    it('reads the log level, ignoring case, and defaults to info', () => {
        expect(loadConfig().logLevel).toBe('info');
        expect(loadConfig({ LOG_LEVEL: '' }).logLevel).toBe('info');
        expect(loadConfig({ LOG_LEVEL: ' Debug ' }).logLevel).toBe('debug');
        expect(loadConfig({ LOG_LEVEL: 'silent' }).logLevel).toBe('silent');
    });

    it('refuses a log level the logger does not know, as a configuration error', () => {
        expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
        expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(
            /LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, silent \(got "verbose"\)/
        );
    });

    it('limits database statements to two minutes unless told otherwise', () => {
        expect(loadConfig().dbStatementTimeoutSeconds).toBe(120);
        expect(loadConfig({ DB_STATEMENT_TIMEOUT_SECONDS: '30' }).dbStatementTimeoutSeconds).toBe(30);
        expect(loadConfig({ DB_STATEMENT_TIMEOUT_SECONDS: '0' }).dbStatementTimeoutSeconds).toBe(0);
        expect(() => loadConfig({ DB_STATEMENT_TIMEOUT_SECONDS: '-1' })).toThrow(ConfigError);
    });

    it('refuses an encryption key under 16 characters', () => {
        expect(() => loadConfig({ SECRETS_KEY: 'short' })).toThrow(/SECRETS_KEY must be at least 16/);
        expect(() => loadConfig({ CONNECTION_KEY: 'short' })).toThrow(/CONNECTION_KEY must be at least 16/);
        expect(() => loadConfig({ SECRETS_KEY: 'k'.repeat(16) })).not.toThrow();
    });
});

describe('connection and listening defaults', () => {
    it('has no built-in database URL', () => {
        expect(() => loadConfigFrom({})).toThrow(/DATABASE_URL is required/);
        expect(() => loadConfigFrom({ DATABASE_URL: '  ' })).toThrow(/DATABASE_URL is required/);
        expect(loadConfig({ DATABASE_URL: 'postgres://a:b@db/x' }).databaseUrl).toBe('postgres://a:b@db/x');
    });

    it('listens on loopback unless HOST says otherwise', () => {
        expect(loadConfig().host).toBe('127.0.0.1');
        expect(loadConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    });
});

describe('the example settings file', () => {
    const example = readFileSync(
        new URL('../.env.example', import.meta.url),
        'utf8'
    );
    const settings = new Map(
        example
            .split('\n')
            .filter((line) => /^[A-Z_]+=/.test(line))
            .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );

    it('holds no usable database password, only a placeholder to replace', () => {
        const url = settings.get('DATABASE_URL') ?? '';
        expect(url).toContain(':<POSTGRES_PASSWORD>@');
        expect(url).not.toMatch(/qubdidb:qubdidb@/);
    });

    it('leaves every key and password blank', () => {
        for (const [name, value] of settings) {
            if (/(KEY|SECRET|PASSWORD)$/.test(name)) {
                expect(value, name).toBe('');
            }
        }
    });
});
