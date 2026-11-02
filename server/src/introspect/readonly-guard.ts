/**
 * Introspection must never change the target database. Every query the
 * drivers send goes through assertReadOnlySql first, in addition to the
 * database-level protections (read-only transaction on PostgreSQL, a
 * least-privilege login is still recommended on SQL Server).
 */
export class UnsafeSqlError extends Error {
    constructor(reason: string) {
        super(`Refusing to run non read-only SQL: ${reason}`);
        this.name = 'UnsafeSqlError';
    }
}

// SELECT INTO creates tables on SQL Server; EXEC runs arbitrary procedures.
const FORBIDDEN = [
    'insert',
    'update',
    'delete',
    'merge',
    'drop',
    'alter',
    'create',
    'truncate',
    'grant',
    'revoke',
    'exec',
    'execute',
    'call',
    'copy',
    'into',
    'vacuum',
    'reindex',
    'cluster',
    'lock',
    'set',
    'begin',
    'commit',
    'rollback',
    'declare',
    'backup',
    'restore',
    'shutdown',
    'kill',
    'dbcc',
    'openrowset',
    'opendatasource',
    'xp_cmdshell',
    'pg_sleep',
    'pg_read_file',
    'lo_import',
    'lo_export',
    'dblink',
];

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'i');

/** Removes comments and the *contents* of string literals / quoted identifiers. */
export function stripSqlNoise(sql: string): string {
    let out = '';
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];
        if (ch === '-' && next === '-') {
            while (i < sql.length && sql[i] !== '\n') i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = sql.indexOf('*/', i + 2);
            if (end === -1) throw new UnsafeSqlError('unterminated comment');
            i = end + 2;
            out += ' ';
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '[') {
            const close = ch === '[' ? ']' : ch;
            let j = i + 1;
            for (;;) {
                if (j >= sql.length) {
                    throw new UnsafeSqlError('unterminated quoted text');
                }
                if (sql[j] === close) {
                    // doubled quote is an escaped quote, not the end
                    if (close !== ']' && sql[j + 1] === close) {
                        j += 2;
                        continue;
                    }
                    break;
                }
                j++;
            }
            out += `${ch}x${close}`;
            i = j + 1;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

export function assertReadOnlySql(sql: string): void {
    const cleaned = stripSqlNoise(sql).trim().replace(/;\s*$/, '');
    if (cleaned === '') throw new UnsafeSqlError('empty statement');
    if (cleaned.includes(';')) {
        throw new UnsafeSqlError('multiple statements');
    }
    if (!/^(select|with)\b/i.test(cleaned)) {
        throw new UnsafeSqlError('must start with SELECT or WITH');
    }
    const hit = cleaned.match(FORBIDDEN_RE);
    if (hit) throw new UnsafeSqlError(`contains "${hit[1].toLowerCase()}"`);
}
