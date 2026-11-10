import { createHash } from 'node:crypto';

/**
 * Introspection must never change the target database. Every query the
 * drivers send is checked twice before it leaves: it must be one of the
 * fixed queries the driver registered (queryAllowlist, the primary control),
 * and it must pass assertReadOnlySql (a denylist kept as defence in depth),
 * in addition to the database-level protections (read-only transaction on
 * PostgreSQL, a least-privilege login is still recommended on SQL Server).
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
    'xp_dirtree',
    'xp_fileexist',
    'xp_subdirs',
    'xp_regread',
    'sp_executesql',
    'sp_oacreate',
    'sp_oamethod',
    'pg_sleep',
    'pg_read_file',
    'pg_read_binary_file',
    'pg_ls_dir',
    'pg_stat_file',
    'lo_import',
    'lo_export',
    'dblink',
    // functions that change the session or the server, or hold it up
    'set_config',
    'pg_terminate_backend',
    'pg_cancel_backend',
    'pg_reload_conf',
    'pg_rotate_logfile',
    'pg_switch_wal',
    'pg_create_restore_point',
    'pg_advisory_lock',
    'pg_advisory_xact_lock',
    'pg_advisory_lock_shared',
    'pg_advisory_xact_lock_shared',
    'pg_notify',
    'pg_sleep_for',
    'pg_sleep_until',
    'pg_logical_emit_message',
    'pg_read_server_files',
    'nextval',
    'setval',
    'waitfor',
    'dblink_exec',
];

// lo_* is every large-object function (lo_import, lo_put, lo_unlink, ...)
const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN.join('|')}|lo_\\w+)\\b`, 'i');

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
        // $$ and $tag$ open a dollar-quoted string that this scanner does not
        // read, so a ';' or a keyword inside it would go unseen: refuse it
        // ($1 is a parameter, and a '$' inside a word is part of its name)
        if (ch === '$' && !/\w/.test(sql[i - 1] ?? '') && /[$A-Za-z_]/.test(next ?? '')) {
            throw new UnsafeSqlError('dollar-quoted text');
        }
        if (ch === "'" || ch === '"' || ch === '[') {
            const close = ch === '[' ? ']' : ch;
            // E'...' (PostgreSQL) lets a backslash escape the next character,
            // quote included; in any other string a backslash is plain text
            const escapes = ch === "'" && /(^|[^\w])[eE]$/.test(sql.slice(Math.max(0, i - 2), i));
            let j = i + 1;
            for (;;) {
                if (j >= sql.length) {
                    throw new UnsafeSqlError('unterminated quoted text');
                }
                if (escapes && sql[j] === '\\') {
                    j += 2;
                    continue;
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

const normalised = (sql: string): string => sql.replace(/\s+/g, ' ').trim();
const digest = (sql: string): string =>
    createHash('sha256').update(normalised(sql)).digest('hex');

/**
 * Builds the check for one driver. Only the exact text of its fixed queries
 * (whitespace aside) is accepted; anything else, however harmless it looks,
 * is refused. The text also has to pass assertReadOnlySql.
 */
export function queryAllowlist(
    queries: Record<string, string>
): (sql: string) => void {
    const allowed = new Set(Object.values(queries).map(digest));
    return (sql) => {
        if (!allowed.has(digest(sql))) {
            throw new UnsafeSqlError('not a registered introspection query');
        }
        assertReadOnlySql(sql);
    };
}
