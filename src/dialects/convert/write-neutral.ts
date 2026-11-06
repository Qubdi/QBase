import type { Flavour, Neutral } from './contract';

export interface TypeOut {
    text: string;
    notes: string[];
    /** enum labels that become a CHECK (col IN (...)) */
    enumValues?: string[];
    /** the type is the native one for an auto-numbered integer column */
    integer?: boolean;
    /** only approximated: the column gets a "Was:" comment */
    approximate?: boolean;
}

interface Context {
    keySized: boolean;
}

const out = (
    text: string,
    notes: string[] = [],
    extra: Partial<TypeOut> = {}
): TypeOut => ({
    text,
    notes,
    ...extra,
});

const pair = (p: number | undefined, s: number | undefined): string =>
    p === undefined ? '' : s === undefined ? `(${p})` : `(${p}, ${s})`;

function intType(
    n: Extract<Neutral, { kind: 'int' }>,
    flavour: Flavour
): string {
    const { bits, unsigned } = n;
    switch (flavour) {
        case 'postgres':
            if (unsigned)
                return bits === 8
                    ? 'smallint'
                    : bits === 64
                      ? 'numeric(20, 0)'
                      : bits === 32
                        ? 'bigint'
                        : 'integer';
            return bits <= 16 ? 'smallint' : bits === 64 ? 'bigint' : 'integer';
        case 'mysql': {
            const base = {
                8: 'TINYINT',
                16: 'SMALLINT',
                24: 'MEDIUMINT',
                32: 'INT',
                64: 'BIGINT',
            }[bits];
            return unsigned ? `${base} UNSIGNED` : base;
        }
        case 'sqlserver':
            if (unsigned)
                return bits === 8
                    ? 'TINYINT'
                    : bits === 64
                      ? 'DECIMAL(20, 0)'
                      : bits === 32
                        ? 'BIGINT'
                        : 'INT';
            return bits === 8 || bits === 16
                ? 'SMALLINT'
                : bits === 64
                  ? 'BIGINT'
                  : 'INT';
        case 'sqlite':
            return 'INTEGER';
    }
}

const MYSQL_TEXT = {
    tiny: 'TINYTEXT',
    regular: 'TEXT',
    medium: 'MEDIUMTEXT',
    long: 'LONGTEXT',
};
const MYSQL_BLOB = {
    tiny: 'TINYBLOB',
    regular: 'BLOB',
    medium: 'MEDIUMBLOB',
    long: 'LONGBLOB',
};

/** The target dialect's spelling of a neutral type (EXP-037, EXP-038). */
export function writeNeutral(
    n: Neutral,
    flavour: Flavour,
    ctx: Context
): TypeOut {
    const isPg = flavour === 'postgres';
    const isMy = flavour === 'mysql';
    const isMs = flavour === 'sqlserver';
    switch (n.kind) {
        case 'int':
            return out(intType(n, flavour), [], { integer: true });
        case 'decimal': {
            if (isPg)
                return out(
                    n.precision === undefined
                        ? 'numeric'
                        : `numeric${pair(n.precision, n.scale)}`
                );
            if (flavour === 'sqlite')
                return out(
                    n.precision === undefined
                        ? 'NUMERIC'
                        : `DECIMAL${pair(n.precision, n.scale)}`
                );
            const max = isMy ? 65 : 38;
            const maxScale = isMy ? 30 : 38;
            if (n.precision === undefined) return out('DECIMAL(38, 10)');
            const notes: string[] = [];
            let p = n.precision;
            let s = n.scale;
            if (p > max) {
                notes.push(`precision ${p} reduced to ${max}`);
                p = max;
            }
            if (s !== undefined && s > maxScale) {
                notes.push(`scale ${s} reduced to ${maxScale}`);
                s = maxScale;
            }
            return out(`DECIMAL${pair(p, s)}`, notes);
        }
        case 'float':
            if (isPg) return out(n.bits === 32 ? 'real' : 'double precision');
            if (isMy) return out(n.bits === 32 ? 'FLOAT' : 'DOUBLE');
            if (isMs) return out(n.bits === 32 ? 'REAL' : 'FLOAT');
            return out('REAL');
        case 'bool':
            return out(
                isPg
                    ? 'boolean'
                    : isMy
                      ? 'TINYINT(1)'
                      : isMs
                        ? 'BIT'
                        : 'BOOLEAN'
            );
        case 'char': {
            const len = n.length ?? 1;
            if (isPg) return out(`char(${len})`);
            if (flavour === 'sqlite') return out(`CHAR(${len})`);
            if (isMy) {
                if (len <= 255) return out(`CHAR(${len})`);
                return len <= 16383
                    ? out(`VARCHAR(${len})`)
                    : out('MEDIUMTEXT');
            }
            if (n.national)
                return len <= 4000
                    ? out(`NCHAR(${len})`)
                    : out('NVARCHAR(MAX)');
            return len <= 8000 ? out(`CHAR(${len})`) : out('VARCHAR(MAX)');
        }
        case 'varchar': {
            const len = n.length === 'max' ? undefined : n.length;
            if (isPg)
                return len === undefined ? out('text') : out(`varchar(${len})`);
            if (flavour === 'sqlite')
                return len === undefined ? out('TEXT') : out(`VARCHAR(${len})`);
            if (isMy) {
                if (len === undefined)
                    return ctx.keySized
                        ? out('VARCHAR(768)', [
                              'shortened to 768 characters so that it can be indexed',
                          ])
                        : out('LONGTEXT');
                if (len > 768 && ctx.keySized)
                    return out('VARCHAR(768)', [
                        `shortened from ${len} to 768 characters so that it can be indexed`,
                    ]);
                return len <= 16383
                    ? out(`VARCHAR(${len})`)
                    : out('MEDIUMTEXT');
            }
            const nat = !!n.national;
            const prefix = nat ? 'NVARCHAR' : 'VARCHAR';
            const key = nat ? 450 : 900;
            if (ctx.keySized && (len === undefined || len > key))
                return out(`${prefix}(${key})`, [
                    `shortened to ${key} characters so that it can be indexed`,
                ]);
            return len !== undefined && len <= (nat ? 4000 : 8000)
                ? out(`${prefix}(${len})`)
                : out(`${prefix}(MAX)`);
        }
        case 'text':
            if (isPg) return out('text');
            if (flavour === 'sqlite') return out('TEXT');
            if (isMy)
                return ctx.keySized
                    ? out('VARCHAR(768)', [
                          'shortened to 768 characters so that it can be indexed',
                      ])
                    : out(MYSQL_TEXT[n.size]);
            return ctx.keySized
                ? out('NVARCHAR(450)', [
                      'shortened to 450 characters so that it can be indexed',
                  ])
                : out('NVARCHAR(MAX)');
        case 'binary':
            if (isPg) return out('bytea');
            if (flavour === 'sqlite') return out('BLOB');
            if (isMy)
                return out(
                    n.length === undefined
                        ? n.varying
                            ? 'LONGBLOB'
                            : 'BLOB'
                        : `${n.varying ? 'VARBINARY' : 'BINARY'}(${n.length})`
                );
            return out(
                n.length === undefined
                    ? 'VARBINARY(MAX)'
                    : `${n.varying ? 'VARBINARY' : 'BINARY'}(${n.length})`
            );
        case 'blob':
            if (isPg) return out('bytea');
            if (flavour === 'sqlite') return out('BLOB');
            return out(isMy ? MYSQL_BLOB[n.size] : 'VARBINARY(MAX)');
        case 'date':
            return out(isMy || isMs || flavour === 'sqlite' ? 'DATE' : 'date');
        case 'time':
            if (isPg) return out(n.zone ? 'timetz' : 'time');
            if (n.zone && !isMs)
                return out(
                    'TIME',
                    ['time zone is lost: stored without a zone'],
                    { approximate: true }
                );
            return out('TIME');
        case 'datetime':
            if (isPg) return out(n.zone ? 'timestamptz' : 'timestamp');
            if (isMs) return out(n.zone ? 'DATETIMEOFFSET' : 'DATETIME2');
            if (n.zone)
                return out(
                    'DATETIME',
                    ['time zone is lost: stored without a zone'],
                    { approximate: true }
                );
            return out('DATETIME');
        case 'json':
            if (isPg) return out(n.binary ? 'jsonb' : 'json');
            if (isMy) return out('JSON');
            if (isMs)
                return ctx.keySized
                    ? out('NVARCHAR(450)', [
                          'JSON shortened to 450 characters so that it can be indexed',
                      ])
                    : out('NVARCHAR(MAX)');
            return out('TEXT');
        case 'uuid':
            return out(isPg ? 'uuid' : isMs ? 'UNIQUEIDENTIFIER' : 'CHAR(36)');
        case 'xml':
            return out(
                isPg ? 'xml' : isMs ? 'XML' : isMy ? 'LONGTEXT' : 'TEXT'
            );
        case 'enum':
            if (n.values && isMy)
                return out(
                    `ENUM(${n.values.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`).join(', ')})`
                );
            if (isMy)
                return out('VARCHAR(255)', [
                    'enum values are not known: stored as text',
                ]);
            return out(
                isPg ? 'varchar(255)' : isMs ? 'NVARCHAR(255)' : 'TEXT',
                n.values ? [] : ['enum values are not known: no CHECK created'],
                { enumValues: n.values }
            );
        case 'bits':
            if (isPg) return out(`bit(${n.length})`);
            if (isMy)
                return n.length <= 64
                    ? out(`BIT(${n.length})`)
                    : out(`BINARY(${Math.ceil(n.length / 8)})`);
            if (isMs)
                return n.length === 1
                    ? out('BIT')
                    : out(`BINARY(${Math.ceil(n.length / 8)})`);
            return n.length <= 63 ? out('INTEGER') : out('BLOB');
        case 'geo':
            if (isPg)
                return out('bytea', [
                    'spatial type stored as bytea: PostGIS is not assumed',
                ]);
            if (isMy)
                return out(
                    'GEOMETRY',
                    n.geography ? ['geography converted to GEOMETRY'] : []
                );
            if (isMs) return out(n.geography ? 'GEOGRAPHY' : 'GEOMETRY');
            return out('BLOB');
        case 'array': {
            const inner = writeNeutral(n.of, flavour, ctx);
            if (isPg) return out(`${inner.text}[]`, inner.notes);
            if (isMy) return out('JSON');
            return out(isMs ? 'NVARCHAR(MAX)' : 'TEXT');
        }
        case 'other':
            return out(
                isPg || flavour === 'sqlite'
                    ? 'text'
                    : isMy
                      ? 'LONGTEXT'
                      : 'NVARCHAR(MAX)'
            );
    }
}
