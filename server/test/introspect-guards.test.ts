import { describe, expect, it } from 'vitest';
import { CryptoBox } from '../src/introspect/crypto-box.js';
import {
    classifyIp,
    ForbiddenTargetError,
    matchesIpEntry,
    parseIPv6,
    resolveAllowedTarget,
} from '../src/introspect/net-guard.js';
import {
    assertReadOnlySql,
    queryAllowlist,
    stripSqlNoise,
    UnsafeSqlError,
} from '../src/introspect/readonly-guard.js';

describe('assertReadOnlySql', () => {
    it('accepts plain catalog selects, with a trailing semicolon too', () => {
        for (const ok of [
            'SELECT 1',
            'select * from pg_class;',
            'WITH x AS (SELECT 1 AS a) SELECT a FROM x',
            "SELECT n.nspname, obj_description(c.oid,'pg_class') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
            'SELECT update_rule, delete_referential_action_desc, create_date FROM sys.foreign_keys',
            '  \n SELECT\n 1 -- trailing comment\n',
        ]) {
            expect(() => assertReadOnlySql(ok), ok).not.toThrow();
        }
    });

    it('rejects every kind of write or side effect', () => {
        for (const bad of [
            'INSERT INTO t VALUES (1)',
            'UPDATE t SET a = 1',
            'DELETE FROM t',
            'DROP TABLE t',
            'ALTER TABLE t ADD c int',
            'CREATE TABLE t (a int)',
            'TRUNCATE t',
            'GRANT ALL ON t TO u',
            'MERGE INTO t USING s ON 1=1 WHEN MATCHED THEN DELETE',
            'EXEC sp_who',
            'EXECUTE xp_cmdshell',
            'CALL do_things()',
            'COPY t TO STDOUT',
            'SELECT * INTO new_table FROM t',
            'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d',
            'SELECT pg_sleep(100)',
            'SELECT pg_read_file(\'/etc/passwd\')',
            'SELECT pg_read_binary_file(\'/etc/passwd\')',
            'SELECT pg_ls_dir(\'/\')',
            'SELECT pg_stat_file(\'/etc/passwd\')',
            "SELECT * FROM sp_executesql(N'x')",
            "SELECT 1 WHERE EXISTS (SELECT 1 FROM xp_dirtree('c:\\\\'))",
            "SELECT * FROM xp_fileexist('c:\\\\x')",
            'SET search_path = x',
            'BEGIN',
            'VACUUM',
            'DBCC CHECKDB',
            'SELECT * FROM OPENROWSET(\'x\')',
        ]) {
            expect(() => assertReadOnlySql(bad), bad).toThrow(UnsafeSqlError);
        }
    });

    it('rejects stacked statements', () => {
        expect(() => assertReadOnlySql('SELECT 1; SELECT 2')).toThrow(/multiple/);
        expect(() => assertReadOnlySql('SELECT 1; DROP TABLE t')).toThrow(UnsafeSqlError);
    });

    it('rejects anything that does not start with SELECT or WITH', () => {
        expect(() => assertReadOnlySql('')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('   ;')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('SHOW TABLES')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('(SELECT 1)')).toThrow(UnsafeSqlError);
    });

    it('is not fooled by comments hiding a write', () => {
        expect(() => assertReadOnlySql('SELECT 1 /* harmless */ ; DROP TABLE t')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('SELECT 1 /* DROP TABLE */')).not.toThrow();
        expect(() => assertReadOnlySql('/* x */ DROP TABLE t')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('SELECT 1 /* unterminated')).toThrow(UnsafeSqlError);
    });

    it('ignores keywords inside strings and quoted identifiers but not outside them', () => {
        expect(() => assertReadOnlySql("SELECT 'DROP TABLE t; DELETE' AS x")).not.toThrow();
        expect(() => assertReadOnlySql('SELECT "delete", [update] FROM t')).not.toThrow();
        expect(() => assertReadOnlySql("SELECT 'it''s; fine' AS x")).not.toThrow();
        expect(() => assertReadOnlySql("SELECT 'a' ; DELETE FROM t")).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql("SELECT 'unterminated")).toThrow(UnsafeSqlError);
    });

    it('is case-insensitive', () => {
        expect(() => assertReadOnlySql('sElEcT 1; dRoP table t')).toThrow(UnsafeSqlError);
        expect(() => assertReadOnlySql('DeLeTe from t')).toThrow(UnsafeSqlError);
    });

    it('strips noise predictably', () => {
        expect(stripSqlNoise("SELECT 'a' -- c\n, 2")).toBe("SELECT 'x' \n, 2");
    });
});

describe('classifyIp', () => {
    const cases: Array<[string, string]> = [
        ['8.8.8.8', 'public'],
        ['1.1.1.1', 'public'],
        ['93.184.216.34', 'public'],
        ['127.0.0.1', 'loopback'],
        ['127.255.255.254', 'loopback'],
        ['10.0.0.1', 'private'],
        ['172.16.0.1', 'private'],
        ['172.31.255.255', 'private'],
        ['172.32.0.1', 'public'],
        ['192.168.1.1', 'private'],
        ['100.64.0.1', 'private'],
        ['100.128.0.1', 'public'],
        ['169.254.169.254', 'link_local'],
        ['0.0.0.0', 'unspecified'],
        ['224.0.0.1', 'multicast'],
        ['255.255.255.255', 'reserved'],
        ['203.0.113.5', 'reserved'],
        ['::1', 'loopback'],
        ['::', 'unspecified'],
        ['fe80::1', 'link_local'],
        ['fec0::1', 'private'],
        ['feff::1', 'private'],
        ['febf::1', 'link_local'],
        ['fc00::1', 'private'],
        ['fd12:3456::1', 'private'],
        ['ff02::1', 'multicast'],
        ['2001:db8::1', 'reserved'],
        ['2606:4700:4700::1111', 'public'],
        ['::ffff:127.0.0.1', 'loopback'],
        ['::ffff:10.1.2.3', 'private'],
        ['::ffff:8.8.8.8', 'public'],
        ['::ffff:7f00:1', 'loopback'],
        // IPv4-translated: the IPv4 target sits in the last four bytes
        ['::ffff:0:a00:1', 'private'],
        ['::ffff:0:7f00:1', 'loopback'],
        ['::ffff:0:a9fe:a9fe', 'link_local'],
        ['::ffff:0:808:808', 'public'],
        // NAT64: only the well-known 64:ff9b::/96 is decoded; the local-use
        // range hides the IPv4 address in another place, so it is never trusted
        ['64:ff9b::a00:1', 'private'],
        ['64:ff9b::808:808', 'public'],
        ['64:ff9b:1::808:808', 'reserved'],
        ['64:ff9b:1:a00:0:0:808:808', 'reserved'],
        ['64:ff9b::a00:1', 'private'],
        // IPv4 hidden in transition ranges
        ['2002:7f00:1::1', 'reserved'],
        ['2002:a00:1::', 'reserved'],
        ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'reserved'],
        ['::7f00:1', 'reserved'],
        ['::10.0.0.1', 'reserved'],
        ['::808:808', 'reserved'],
    ];
    it.each(cases)('%s is %s', (ip, expected) => {
        expect(classifyIp(ip)).toBe(expected);
    });

    it('never trusts garbage', () => {
        expect(classifyIp('not-an-ip')).toBe('reserved');
        expect(classifyIp('999.1.1.1')).toBe('reserved');
    });

    it('parses IPv6 text forms', () => {
        expect(parseIPv6('::1')?.[15]).toBe(1);
        expect(parseIPv6('1:2:3:4:5:6:7:8')).toHaveLength(16);
        expect(parseIPv6('::ffff:1.2.3.4')?.slice(12)).toEqual([1, 2, 3, 4]);
        expect(parseIPv6('1::2::3')).toBeNull();
    });
});

describe('matchesIpEntry', () => {
    it('matches exact IPs and IPv4 CIDRs', () => {
        expect(matchesIpEntry('10.1.2.3', '10.1.2.3')).toBe(true);
        expect(matchesIpEntry('10.1.2.3', '10.1.2.4')).toBe(false);
        expect(matchesIpEntry('10.1.2.3', '10.0.0.0/8')).toBe(true);
        expect(matchesIpEntry('11.1.2.3', '10.0.0.0/8')).toBe(false);
        expect(matchesIpEntry('192.168.1.77', '192.168.1.0/24')).toBe(true);
        expect(matchesIpEntry('192.168.2.1', '192.168.1.0/24')).toBe(false);
        expect(matchesIpEntry('1.2.3.4', '0.0.0.0/0')).toBe(true);
        expect(matchesIpEntry('::1', '::1')).toBe(true);
    });

    it('ignores malformed entries', () => {
        expect(matchesIpEntry('10.0.0.1', '10.0.0.0/33')).toBe(false);
        expect(matchesIpEntry('10.0.0.1', 'nonsense/8')).toBe(false);
        expect(matchesIpEntry('::1', '10.0.0.0/8')).toBe(false);
    });
});

describe('resolveAllowedTarget', () => {
    const lookupOf =
        (map: Record<string, string[]>) => async (host: string) =>
            (map[host] ?? []).map((address) => ({
                address,
                family: address.includes(':') ? 6 : 4,
            }));

    it('allows public hosts and returns the resolved address to connect to', async () => {
        const r = await resolveAllowedTarget('db.example.com', [], lookupOf({ 'db.example.com': ['93.184.216.34'] }));
        expect(r).toEqual({ address: '93.184.216.34', family: 4 });
    });

    it('blocks loopback, private, metadata and IPv6 local targets', async () => {
        for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.0.9', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
            await expect(resolveAllowedTarget(ip), ip).rejects.toBeInstanceOf(ForbiddenTargetError);
        }
    });

    it('blocks a public-looking name that resolves to a private address', async () => {
        await expect(
            resolveAllowedTarget('evil.example.com', [], lookupOf({ 'evil.example.com': ['10.0.0.8'] }))
        ).rejects.toBeInstanceOf(ForbiddenTargetError);
    });

    it('does not tell the caller which address a blocked name resolves to', async () => {
        const err = await resolveAllowedTarget(
            'evil.example.com',
            [],
            lookupOf({ 'evil.example.com': ['10.20.30.40'] })
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ForbiddenTargetError);
        const message = (err as Error).message;
        expect(message).not.toContain('10.20.30.40');
        expect(message).toContain('evil.example.com');
        expect(message).toContain('private address');
    });

    it('blocks when only one of several resolved addresses is private (DNS rebinding mix)', async () => {
        await expect(
            resolveAllowedTarget('mixed.example.com', [], lookupOf({ 'mixed.example.com': ['93.184.216.34', '127.0.0.1'] }))
        ).rejects.toBeInstanceOf(ForbiddenTargetError);
    });

    it('unwraps bracketed IPv6 literals before classifying them', async () => {
        for (const ip of ['[::1]', '[fd00::1]', ' [::ffff:127.0.0.1] ']) {
            await expect(resolveAllowedTarget(ip), ip).rejects.toBeInstanceOf(ForbiddenTargetError);
        }
        expect((await resolveAllowedTarget('[2606:4700:4700::1111]')).address).toBe('2606:4700:4700::1111');
    });

    it('blocks alternative spellings of loopback that the system resolver accepts', async () => {
        // decimal, shortened, hex and octal forms all mean 127.0.0.1 to getaddrinfo
        for (const host of ['2130706433', '127.1', '0x7f000001', '0177.0.0.1', '0']) {
            await expect(resolveAllowedTarget(host), host).rejects.toBeInstanceOf(ForbiddenTargetError);
        }
    });

    it('blocks hosts that do not resolve or are empty', async () => {
        await expect(resolveAllowedTarget('nope.invalid', [], lookupOf({}))).rejects.toThrow(/did not resolve/);
        await expect(resolveAllowedTarget('  ')).rejects.toThrow(/empty/);
    });

    it('lets an admin allow-list a hostname, an IP or a CIDR', async () => {
        const lookup = lookupOf({ 'db.internal': ['10.2.3.4'] });
        expect((await resolveAllowedTarget('db.internal', ['db.internal'], lookup)).address).toBe('10.2.3.4');
        expect((await resolveAllowedTarget('db.internal', ['10.2.3.4'], lookup)).address).toBe('10.2.3.4');
        expect((await resolveAllowedTarget('db.internal', ['10.0.0.0/8'], lookup)).address).toBe('10.2.3.4');
        expect((await resolveAllowedTarget('127.0.0.1', ['127.0.0.1'])).address).toBe('127.0.0.1');
        await expect(resolveAllowedTarget('db.internal', ['192.168.0.0/16'], lookup)).rejects.toBeInstanceOf(ForbiddenTargetError);
    });

    it('does not let a CIDR entry match as a hostname', async () => {
        await expect(
            resolveAllowedTarget('db.internal', ['db.internal/8'], lookupOf({ 'db.internal': ['10.2.3.4'] }))
        ).rejects.toBeInstanceOf(ForbiddenTargetError);
    });
});

describe('CryptoBox', () => {
    const box = new CryptoBox('a-long-enough-secret-key');

    it('round-trips text, including unicode and empty strings', () => {
        for (const s of ['hunter2', 'pässwörd ✓ 日本', '', 'x'.repeat(5000)]) {
            expect(box.decrypt(box.encrypt(s))).toBe(s);
        }
    });

    it('never stores the plaintext and uses a fresh IV each time', () => {
        const a = box.encrypt('secret-password');
        const b = box.encrypt('secret-password');
        expect(a).not.toContain('secret-password');
        expect(a).not.toBe(b);
        expect(a.startsWith('v2:')).toBe(true);
    });

    it('detects tampering', () => {
        const enc = box.encrypt('secret-password');
        const parts = enc.split(':');
        parts[3] = Buffer.from('tampered-data').toString('base64');
        expect(() => box.decrypt(parts.join(':'))).toThrow();
        const flipped = enc.slice(0, -2) + (enc.endsWith('A=') ? 'B=' : 'A=');
        expect(() => box.decrypt(flipped)).toThrow();
    });

    it('refuses a shortened authentication tag', () => {
        const parts = box.encrypt('secret-password').split(':');
        parts[2] = Buffer.from(parts[2], 'base64').subarray(0, 4).toString('base64');
        expect(() => box.decrypt(parts.join(':'))).toThrow('Unsupported encrypted value');
    });

    it('fails with the wrong key', () => {
        const other = new CryptoBox('another-long-secret-key!');
        expect(() => other.decrypt(box.encrypt('secret-password'))).toThrow();
    });

    it('rejects unsupported formats and weak keys', () => {
        expect(() => box.decrypt('v2:a:b:c')).toThrow(/Unsupported/);
        expect(() => box.decrypt('garbage')).toThrow();
        expect(() => new CryptoBox('short')).toThrow(/at least 16/);
    });
});

describe('queryAllowlist', () => {
    const fixed = {
        one: 'SELECT a FROM t WHERE b = $1',
        two: `
            SELECT c
            FROM u`,
    };
    const check = queryAllowlist(fixed);

    it('accepts a registered query, whatever its whitespace', () => {
        expect(() => check(fixed.one)).not.toThrow();
        expect(() => check(fixed.two)).not.toThrow();
        expect(() => check('SELECT c   FROM\n u')).not.toThrow();
    });

    it('refuses a harmless query nobody registered', () => {
        expect(() => check('SELECT 1')).toThrow(/not a registered/);
        expect(() => check('SELECT pg_read_binary_file(1)')).toThrow(UnsafeSqlError);
    });

    it('refuses a registered query that was altered, even by one character', () => {
        expect(() => check('SELECT a FROM t WHERE b = $2')).toThrow(/not a registered/);
        expect(() => check(`${fixed.one} OR 1 = 1`)).toThrow(/not a registered/);
        expect(() => check(`${fixed.one}; DROP TABLE t`)).toThrow(UnsafeSqlError);
        expect(() => check(fixed.one.toLowerCase())).toThrow(/not a registered/);
    });

    it('still applies the denylist to a registered query', () => {
        const risky = queryAllowlist({ bad: 'SELECT xp_dirtree(1)' });
        expect(() => risky('SELECT xp_dirtree(1)')).toThrow(/xp_dirtree/);
    });
});
