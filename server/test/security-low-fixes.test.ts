import { describe, expect, it } from 'vitest';
import { sessionTokenOf } from '../src/auth/sessions.js';
import { CryptoBox } from '../src/introspect/crypto-box.js';
import { classifyIp } from '../src/introspect/net-guard.js';
import {
    assertReadOnlySql,
    stripSqlNoise,
} from '../src/introspect/readonly-guard.js';
import { addressKey } from '../src/lib/rate-key.js';

describe('addressKey (SEC-038)', () => {
    it('counts an IPv6 client by its /64', () => {
        const a = addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
        const b = addressKey('2001:db8:1:2::1');
        expect(a).toBe(b);
        expect(a).toBe('2001:db8:1:2::/64');
        expect(addressKey('2001:db8:1:3::1')).not.toBe(a);
    });
    it('leaves IPv4 alone, and reads a mapped IPv4 address as IPv4', () => {
        expect(addressKey('203.0.113.9')).toBe('203.0.113.9');
        expect(addressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    });
});

describe('sessionTokenOf (SEC-039)', () => {
    const both = { '__Host-qbase_session': 'host', qbase_session: 'plain' };
    it('over https takes only the __Host- cookie', () => {
        expect(sessionTokenOf(both, true)).toBe('host');
        expect(sessionTokenOf({ qbase_session: 'plain' }, true)).toBeUndefined();
    });
    it('over plain http keeps the old order', () => {
        expect(sessionTokenOf(both)).toBe('host');
        expect(sessionTokenOf({ qbase_session: 'plain' })).toBe('plain');
    });
});

describe('read-only guard scanner (SEC-043, SEC-044)', () => {
    it('refuses dollar-quoted text, which hides ; and keywords from the scanner', () => {
        expect(() => assertReadOnlySql("SELECT $$ ; drop table t; $$")).toThrow();
        expect(() => assertReadOnlySql('SELECT $a$x$a$')).toThrow();
    });
    it('still accepts a $1 parameter and a $ inside a literal', () => {
        expect(() => assertReadOnlySql('SELECT 1 WHERE a = $1')).not.toThrow();
        expect(() => assertReadOnlySql("SELECT '$$'")).not.toThrow();
    });
    it("reads E'...\\'...' as one string, so a following ; is seen", () => {
        expect(stripSqlNoise("SELECT E'a\\'b' ")).toBe("SELECT E'x' ");
        expect(() => assertReadOnlySql("SELECT E'\\''; DELETE FROM t; --'")).toThrow();
        // without the E a backslash is plain text
        expect(() => assertReadOnlySql("SELECT 'a\\'")).not.toThrow();
    });
    it('refuses functions that change the server or hold it up', () => {
        for (const fn of [
            "set_config('a','b',false)",
            'pg_terminate_backend(1)',
            'pg_cancel_backend(1)',
            'pg_reload_conf()',
            'pg_advisory_lock(1)',
            "lo_unlink(1)",
            "lo_put(1,0,'x')",
            "nextval('s')",
        ]) {
            expect(() => assertReadOnlySql(`SELECT ${fn}`), fn).toThrow();
        }
    });
});

describe('classifyIp special-use ranges (SEC-045)', () => {
    it.each([
        ['100::1', 'reserved'],
        ['100:0:0:1::1', 'public'],
        ['5f00::1', 'reserved'],
        ['5f01::1', 'public'],
        ['3fff::1', 'reserved'],
        ['3fff:0fff::1', 'reserved'],
        ['3fff:1000::1', 'public'],
        ['192.88.99.1', 'reserved'],
        ['192.88.98.1', 'public'],
    ])('%s is %s', (ip, expected) => {
        expect(classifyIp(ip)).toBe(expected);
    });
});

describe('CryptoBox context binding (SEC-046)', () => {
    const box = new CryptoBox('a-secret-of-32-chars-or-more-yes!', 'share-link');
    it('opens a value only with the context it was sealed with', () => {
        const sealed = box.encrypt('token', 'row-1');
        expect(sealed.startsWith('v3:')).toBe(true);
        expect(box.decrypt(sealed, 'row-1')).toBe('token');
        expect(() => box.decrypt(sealed, 'row-2')).toThrow();
        expect(() => box.decrypt(sealed)).toThrow();
    });
    it('still writes and reads v2 without a context', () => {
        const sealed = box.encrypt('x');
        expect(sealed.startsWith('v2:')).toBe(true);
        expect(box.decrypt(sealed)).toBe('x');
        expect(box.decrypt(sealed, 'anything')).toBe('x');
    });
    it('does not open a value sealed for another purpose with the same context', () => {
        const other = new CryptoBox('a-secret-of-32-chars-or-more-yes!', 'webhook');
        expect(() => other.decrypt(box.encrypt('x', 'row-1'), 'row-1')).toThrow();
    });
});
