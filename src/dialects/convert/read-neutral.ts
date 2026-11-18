import type { Column } from '@/core/model/column';
import type { UserType } from '@/core/model/user-type';
import type { Flavour, Neutral, NeutralRead } from './contract';

const norm = (name: string): string =>
    name
        .toLowerCase()
        .replace(/\b(unsigned|zerofill|signed)\b/g, '')
        .replace(/[_\s]+/g, ' ')
        .trim();

const TEXT_SIZES: Record<string, 'tiny' | 'regular' | 'medium' | 'long'> = {
    tinytext: 'tiny',
    text: 'regular',
    ntext: 'regular',
    mediumtext: 'medium',
    longtext: 'long',
    clob: 'long',
    nclob: 'long',
    long: 'long',
};
const BLOB_SIZES: Record<string, 'tiny' | 'regular' | 'medium' | 'long'> = {
    tinyblob: 'tiny',
    blob: 'regular',
    mediumblob: 'medium',
    longblob: 'long',
};
const NOTED_AS_TEXT = new Set([
    'interval',
    'inet',
    'cidr',
    'macaddr',
    'macaddr8',
    'point',
    'line',
    'lseg',
    'box',
    'path',
    'polygon',
    'circle',
    'tsvector',
    'tsquery',
    'int4range',
    'int8range',
    'numrange',
    'tsrange',
    'tstzrange',
    'daterange',
    'set',
    'interval year to month',
    'interval day to second',
]);

/** Reads a stored column type into a neutral description (EXP-037). */
export function readNeutral(
    column: Column,
    flavour: Flavour,
    userTypes: readonly UserType[]
): NeutralRead {
    const raw = column.type.name;
    const unsigned = /\bunsigned\b/i.test(raw);
    const isArray = column.isArray || raw.endsWith('[]');
    const name = norm(raw.replace(/\[\]$/, ''));
    const inner = readBase(column, name, unsigned, flavour, userTypes);
    if (isArray)
        return {
            ...inner,
            neutral: { kind: 'array', of: inner.neutral },
            approximate: true,
        };
    return inner;
}

function readBase(
    column: Column,
    name: string,
    unsigned: boolean,
    flavour: Flavour,
    userTypes: readonly UserType[]
): NeutralRead {
    const n = (
        neutral: Neutral,
        extra: Partial<NeutralRead> = {}
    ): NeutralRead => ({ neutral, ...extra });
    const length =
        typeof column.length === 'number' ? column.length : undefined;
    // an alias type reaches a column as its base type, with the alias as `domain`
    const custom = userTypes.find(
        (t) => t.kind !== 'alias' && t.name === column.type.name
    );
    if (custom)
        return custom.kind === 'enum'
            ? n({ kind: 'enum', values: custom.values ?? [] })
            : n(
                  { kind: 'json', binary: true },
                  {
                      note: `composite type ${custom.name} stored as JSON`,
                      approximate: true,
                  }
              );

    switch (name) {
        case 'serial':
        case 'serial4':
            return n({ kind: 'int', bits: 32 }, { numbered: { bits: 32 } });
        case 'bigserial':
        case 'serial8':
            return n({ kind: 'int', bits: 64 }, { numbered: { bits: 64 } });
        case 'smallserial':
        case 'serial2':
            return n({ kind: 'int', bits: 16 }, { numbered: { bits: 16 } });
        case 'tinyint':
            return flavour === 'sqlserver'
                ? n({ kind: 'int', bits: 8, unsigned: true })
                : n({ kind: 'int', bits: 8, unsigned });
        case 'smallint':
        case 'int2':
        case 'year':
            return n({ kind: 'int', bits: 16, unsigned });
        case 'mediumint':
            return n({ kind: 'int', bits: 24, unsigned });
        case 'int':
        case 'int4':
            return n({ kind: 'int', bits: 32, unsigned });
        case 'integer':
            return n({
                kind: 'int',
                bits: flavour === 'sqlite' ? 64 : 32,
                unsigned,
            });
        case 'bigint':
        case 'int8':
            return n({ kind: 'int', bits: 64, unsigned });
        case 'number':
            if (flavour === 'oracle') return readOracleNumber(column);
            return n({
                kind: 'decimal',
                precision: column.precision,
                scale: column.scale,
            });
        case 'decimal':
        case 'numeric':
        case 'dec':
            return n({
                kind: 'decimal',
                precision: column.precision,
                scale: column.scale,
            });
        case 'money':
            return n(
                {
                    kind: 'decimal',
                    precision: flavour === 'sqlserver' ? 19 : 19,
                    scale: flavour === 'sqlserver' ? 4 : 2,
                },
                {
                    note: 'money converted to a fixed-point number',
                    approximate: true,
                }
            );
        case 'smallmoney':
            return n(
                { kind: 'decimal', precision: 10, scale: 4 },
                {
                    note: 'smallmoney converted to a fixed-point number',
                    approximate: true,
                }
            );
        case 'real':
            return n({
                kind: 'float',
                bits: flavour === 'sqlite' || flavour === 'mysql' ? 64 : 32,
            });
        case 'float4':
            return n({ kind: 'float', bits: 32 });
        case 'float':
            if (flavour === 'mysql')
                return n({
                    kind: 'float',
                    bits: (column.precision ?? 0) > 24 ? 64 : 32,
                });
            return n({
                kind: 'float',
                bits:
                    (flavour === 'sqlserver' || flavour === 'oracle') &&
                    (column.precision ?? 53) <= 24
                        ? 32
                        : 64,
            });
        case 'double':
        case 'double precision':
        case 'float8':
            return n({ kind: 'float', bits: 64 });
        case 'boolean':
        case 'bool':
            return n({ kind: 'bool' });
        case 'bit':
            if (
                flavour === 'sqlserver' ||
                flavour === 'sqlite' ||
                (length ?? 1) === 1
            )
                return n({ kind: 'bool' });
            return n({ kind: 'bits', length: length ?? 1 });
        case 'varbit':
        case 'bit varying':
            return n({ kind: 'bits', length: length ?? 1 });
        case 'char':
        case 'character':
        case 'bpchar':
            return n({ kind: 'char', length });
        case 'nchar':
            return n({ kind: 'char', length, national: true });
        case 'varchar':
        case 'character varying':
        case 'varchar2':
            return n({ kind: 'varchar', length: column.length });
        case 'nvarchar':
        case 'nvarchar2':
            return n({
                kind: 'varchar',
                length: column.length,
                national: true,
            });
        case 'raw':
            // RAW(16) filled by SYS_GUID() is how Oracle keeps a uuid
            if (
                length === 16 &&
                /^\(*\s*sys_guid\(\)\s*\)*$/i.test(column.default?.trim() ?? '')
            )
                return n({ kind: 'uuid' });
            return n({ kind: 'binary', length, varying: true });
        case 'long raw':
            return n({ kind: 'blob', size: 'long' });
        case 'bfile':
            return n(
                { kind: 'blob', size: 'long' },
                {
                    note: 'BFILE (an external file) converted to a binary column',
                    approximate: true,
                }
            );
        case 'rowid':
        case 'urowid':
            return n(
                { kind: 'varchar', length: 255 },
                { note: `${name} stored as text`, approximate: true }
            );
        case 'xmltype':
            return n({ kind: 'xml' });
        case 'binary float':
            return n({ kind: 'float', bits: 32 });
        case 'binary double':
            return n({ kind: 'float', bits: 64 });
        case 'bytea':
            return n({ kind: 'binary', varying: true });
        case 'binary':
            return n({ kind: 'binary', length, varying: false });
        case 'varbinary':
            return n({ kind: 'binary', length, varying: true });
        case 'image':
            return n({ kind: 'blob', size: 'long' });
        case 'date':
            // an Oracle DATE holds a time of day as well
            if (flavour === 'oracle')
                return n(
                    { kind: 'datetime', zone: false },
                    {
                        note: 'Oracle DATE holds a time of day: converted to a timestamp',
                    }
                );
            return n({ kind: 'date' });
        case 'time':
        case 'time without time zone':
            return n({ kind: 'time', zone: false });
        case 'timetz':
        case 'time with time zone':
            return n({ kind: 'time', zone: true });
        case 'timestamp':
            if (flavour === 'sqlserver')
                return n(
                    { kind: 'binary', length: 8, varying: false },
                    {
                        note: 'row version column converted to BINARY(8)',
                        approximate: true,
                    }
                );
            return n({ kind: 'datetime', zone: false });
        case 'rowversion':
            return n(
                { kind: 'binary', length: 8, varying: false },
                {
                    note: 'row version column converted to BINARY(8)',
                    approximate: true,
                }
            );
        case 'datetime':
        case 'datetime2':
        case 'smalldatetime':
        case 'timestamp without time zone':
            return n({ kind: 'datetime', zone: false });
        case 'timestamptz':
        case 'timestamp with time zone':
        case 'timestamp with local time zone':
        case 'datetimeoffset':
            return n({ kind: 'datetime', zone: true });
        case 'json':
            return n({ kind: 'json', binary: flavour !== 'postgres' });
        case 'jsonb':
            return n({ kind: 'json', binary: true });
        case 'uuid':
        case 'uniqueidentifier':
            return n({ kind: 'uuid' });
        case 'xml':
            return n({ kind: 'xml' });
        case 'enum':
            return n({ kind: 'enum' });
        case 'geometry':
            return n({ kind: 'geo', geography: false });
        case 'geography':
            return n({ kind: 'geo', geography: true });
        case 'oid':
        case 'regclass':
        case 'regproc':
        case 'regtype':
        case 'regnamespace':
        case 'regrole':
            return n(
                { kind: 'int', bits: 64 },
                { note: `${name} converted to a number`, approximate: true }
            );
        default:
    }
    if (TEXT_SIZES[name]) return n({ kind: 'text', size: TEXT_SIZES[name] });
    if (BLOB_SIZES[name]) return n({ kind: 'blob', size: BLOB_SIZES[name] });
    if (NOTED_AS_TEXT.has(name))
        return n(
            { kind: 'varchar', length: 255 },
            { note: `${name} stored as text`, approximate: true }
        );
    return n(
        {
            kind: 'other',
            note: `unknown type "${column.type.name}"; stored as text`,
        },
        {
            note: `unknown type "${column.type.name}"; stored as text`,
            approximate: true,
        }
    );
}

/** An Oracle NUMBER with no decimals is a whole number whose size follows its precision. */
function readOracleNumber(column: Column): NeutralRead {
    const { precision, scale } = column;
    if (precision === undefined || (scale ?? 0) !== 0)
        return { neutral: { kind: 'decimal', precision, scale } };
    if (precision <= 4) return { neutral: { kind: 'int', bits: 16 } };
    if (precision <= 9) return { neutral: { kind: 'int', bits: 32 } };
    if (precision <= 18) return { neutral: { kind: 'int', bits: 64 } };
    return { neutral: { kind: 'decimal', precision, scale: 0 } };
}
