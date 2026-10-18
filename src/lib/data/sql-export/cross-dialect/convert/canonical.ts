/**
 * A dialect-neutral description of a column type, and the parser that reads
 * any source dialect's type name into it. Converting is then two steps
 * (source type -> neutral type -> target type) instead of one table for every
 * pair of dialects.
 */

import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import {
    DBCustomTypeKind,
    type DBCustomType,
} from '@/lib/domain/db-custom-type';

export type SourceDialect =
    'postgresql' | 'mysql' | 'sqlserver' | 'sqlite' | 'generic';
export type TargetDialect = 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';

export const sourceDialectOf = (
    databaseType: DatabaseType
): SourceDialect | null => {
    switch (databaseType) {
        case DatabaseType.POSTGRESQL:
        case DatabaseType.COCKROACHDB:
            return 'postgresql';
        case DatabaseType.MYSQL:
        case DatabaseType.MARIADB:
            return 'mysql';
        case DatabaseType.SQL_SERVER:
            return 'sqlserver';
        case DatabaseType.SQLITE:
            return 'sqlite';
        case DatabaseType.GENERIC:
            return 'generic';
        default:
            // Oracle and ClickHouse have no converter
            return null;
    }
};

export const targetDialectOf = (
    databaseType: DatabaseType
): TargetDialect | null => {
    switch (databaseType) {
        case DatabaseType.POSTGRESQL:
            return 'postgresql';
        case DatabaseType.MYSQL:
        case DatabaseType.MARIADB:
            return 'mysql';
        case DatabaseType.SQL_SERVER:
            return 'sqlserver';
        case DatabaseType.SQLITE:
            return 'sqlite';
        default:
            return null;
    }
};

export type IntBits = 8 | 16 | 24 | 32 | 64;
export type TextSize = 'tiny' | 'regular' | 'medium' | 'long';

export type Canon =
    | { kind: 'int'; bits: IntBits; unsigned?: boolean }
    | { kind: 'decimal'; precision?: number; scale?: number }
    | { kind: 'float'; bits: 32 | 64 }
    | { kind: 'bool' }
    /** fixed length */
    | { kind: 'char'; length?: number; national: boolean }
    | { kind: 'varchar'; length?: number | 'max'; national: boolean }
    | { kind: 'text'; size: TextSize; national: boolean }
    | { kind: 'binary'; length?: number }
    | { kind: 'varbinary'; length?: number | 'max' }
    | { kind: 'blob'; size: TextSize }
    | { kind: 'date' }
    | { kind: 'time'; tz: boolean }
    | { kind: 'datetime'; tz: boolean }
    | { kind: 'json'; binary: boolean }
    | { kind: 'uuid' }
    | { kind: 'xml' }
    | { kind: 'enum'; values?: string[] }
    | { kind: 'bitstring'; length?: number }
    | { kind: 'geo'; name: string }
    | { kind: 'array'; of: Canon };

export interface ParsedType {
    canon: Canon;
    /** the type is an auto-numbering one (serial and friends) */
    auto?: boolean;
    /** set when the type is only approximated: what the user should know */
    note?: string;
}

interface Normalized {
    base: string;
    args: number[];
    unsigned: boolean;
    isArray: boolean;
    values?: string[];
}

const parseQuotedList = (inner: string): string[] => {
    const values: string[] = [];
    const re = /'((?:[^']|'')*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) values.push(m[1].replace(/''/g, "'"));
    return values;
};

const normalize = (name: string): Normalized => {
    let n = name.trim().toLowerCase();
    let isArray = false;
    while (n.endsWith('[]')) {
        isArray = true;
        n = n.slice(0, -2).trim();
    }

    const list = n.match(/^(enum|set)\s*\((.*)\)$/s);
    if (list) {
        return {
            base: list[1],
            args: [],
            unsigned: false,
            isArray,
            values: parseQuotedList(list[2]),
        };
    }

    let args: number[] = [];
    const paren = n.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/s);
    if (paren) {
        args = paren[2]
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((x) => !Number.isNaN(x));
        n = `${paren[1]} ${paren[3]}`;
    }
    const unsigned = /\bunsigned\b/.test(n);
    n = n
        .replace(/\bunsigned\b/g, '')
        .replace(/\bzerofill\b/g, '')
        .replace(/\bsigned\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return { base: n, args, unsigned, isArray };
};

const lengthOf = (
    field: DBField,
    args: number[]
): number | 'max' | undefined => {
    const raw = field.characterMaximumLength?.toString().trim().toLowerCase();
    if (raw === '-1' || raw === 'max') return 'max';
    if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n > 0) return n;
    }
    return args[0] && args[0] > 0 ? args[0] : undefined;
};

const findCustomType = (
    name: string,
    customTypes: DBCustomType[]
): DBCustomType | undefined => {
    const wanted = name.toLowerCase();
    return customTypes.find((ct) => {
        const qualified = ct.schema ? `${ct.schema}.${ct.name}` : ct.name;
        return (
            qualified.toLowerCase() === wanted ||
            ct.name.toLowerCase() === wanted
        );
    });
};

const text = (size: TextSize, national = true): Canon => ({
    kind: 'text',
    size,
    national,
});

/** types that have no equivalent anywhere: kept as text, and said so */
const asText = (note: string, size: TextSize = 'long'): ParsedType => ({
    canon: text(size),
    note,
});

const asVarchar = (length: number, note: string): ParsedType => ({
    canon: { kind: 'varchar', length, national: true },
    note,
});

/** Reads a field's type, in the dialect it came from, into the neutral form. */
export function parseSourceType(
    field: DBField,
    source: SourceDialect,
    customTypes: DBCustomType[] = []
): ParsedType {
    const rawName = field.type.name;
    const norm = normalize(rawName);
    let { base } = norm;
    const { args, unsigned, values } = norm;

    if (field.isArray || norm.isArray) {
        const inner = parseSourceType(
            {
                ...field,
                isArray: false,
                type: { ...field.type, name: rawName.replace(/(\[\])+$/, '') },
            },
            source,
            customTypes
        );
        return {
            canon: { kind: 'array', of: inner.canon },
            note: `${rawName} is an array`,
        };
    }

    // PostgreSQL enums and composite types are declared in the diagram
    const custom = findCustomType(rawName, customTypes);
    if (custom) {
        if (
            custom.kind === DBCustomTypeKind.enum &&
            custom.values &&
            custom.values.length > 0
        ) {
            return { canon: { kind: 'enum', values: [...custom.values] } };
        }
        if (custom.kind === DBCustomTypeKind.composite) {
            return {
                canon: { kind: 'json', binary: true },
                note: `${rawName} is a composite type; stored as JSON`,
            };
        }
    }

    const len = lengthOf(field, args);
    const precision = field.precision ?? args[0];
    const scale = field.scale ?? args[1];

    // the app's own ids use underscores where the names use spaces
    base = base.replace(/_/g, ' ');

    // --- auto-numbering
    if (base === 'serial' || base === 'serial4')
        return { canon: { kind: 'int', bits: 32 }, auto: true };
    if (base === 'bigserial' || base === 'serial8')
        return { canon: { kind: 'int', bits: 64 }, auto: true };
    if (base === 'smallserial' || base === 'serial2')
        return { canon: { kind: 'int', bits: 16 }, auto: true };

    // --- integers
    switch (base) {
        case 'tinyint':
        case 'int1':
            // SQL Server's tinyint is 0..255, MySQL's is -128..127
            return source === 'sqlserver'
                ? { canon: { kind: 'int', bits: 8, unsigned: true } }
                : { canon: { kind: 'int', bits: 8, unsigned } };
        case 'smallint':
        case 'int2':
            return { canon: { kind: 'int', bits: 16, unsigned } };
        case 'mediumint':
            return { canon: { kind: 'int', bits: 24, unsigned } };
        case 'int':
        case 'int4':
            return { canon: { kind: 'int', bits: 32, unsigned } };
        case 'integer':
            // a SQLite INTEGER holds up to 64 bits
            return {
                canon: {
                    kind: 'int',
                    bits: source === 'sqlite' ? 64 : 32,
                    unsigned,
                },
            };
        case 'bigint':
        case 'int8':
            return { canon: { kind: 'int', bits: 64, unsigned } };
        case 'year':
            return { canon: { kind: 'int', bits: 16 } };
    }

    // --- exact and approximate numbers
    switch (base) {
        case 'decimal':
        case 'numeric':
        case 'dec':
        case 'number':
        case 'fixed':
            return {
                canon: {
                    kind: 'decimal',
                    precision: precision ?? undefined,
                    scale: scale ?? undefined,
                },
            };
        case 'money':
            return {
                canon:
                    source === 'sqlserver'
                        ? { kind: 'decimal', precision: 19, scale: 4 }
                        : { kind: 'decimal', precision: 19, scale: 2 },
                note: 'money has no equivalent; stored as an exact decimal',
            };
        case 'smallmoney':
            return {
                canon: { kind: 'decimal', precision: 10, scale: 4 },
                note: 'smallmoney has no equivalent; stored as an exact decimal',
            };
        case 'real':
            // PostgreSQL and SQL Server: 4 bytes. SQLite and MySQL: 8 bytes
            return {
                canon: {
                    kind: 'float',
                    bits:
                        source === 'postgresql' || source === 'sqlserver'
                            ? 32
                            : 64,
                },
            };
        case 'float4':
        case 'binary float':
        case 'binary_float':
            return { canon: { kind: 'float', bits: 32 } };
        case 'float':
            if (args[0] !== undefined)
                return {
                    canon: { kind: 'float', bits: args[0] <= 24 ? 32 : 64 },
                };
            // MySQL's FLOAT is single precision; everywhere else it is double
            return {
                canon: { kind: 'float', bits: source === 'mysql' ? 32 : 64 },
            };
        case 'double':
        case 'double precision':
        case 'float8':
        case 'binary double':
        case 'binary_double':
            return { canon: { kind: 'float', bits: 64 } };
    }

    // --- booleans and bits
    switch (base) {
        case 'boolean':
        case 'bool':
            return { canon: { kind: 'bool' } };
        case 'bit':
            if (source === 'sqlserver' || source === 'sqlite')
                return { canon: { kind: 'bool' } };
            if (source === 'mysql' && (args[0] === undefined || args[0] <= 1))
                return { canon: { kind: 'bool' } };
            return { canon: { kind: 'bitstring', length: args[0] ?? 1 } };
        case 'varbit':
        case 'bit varying':
            return { canon: { kind: 'bitstring', length: args[0] } };
    }

    // --- character data
    const national = source === 'sqlserver' ? false : true;
    switch (base) {
        case 'char':
        case 'character':
        case 'bpchar':
        case 'national char':
        case 'national character':
            return {
                canon: {
                    kind: 'char',
                    length: len === 'max' ? undefined : len,
                    national: base.startsWith('national') ? true : national,
                },
            };
        case 'nchar':
            return {
                canon: {
                    kind: 'char',
                    length: len === 'max' ? undefined : len,
                    national: true,
                },
            };
        case 'varchar':
        case 'character varying':
        case 'varying character':
        case 'varchar2':
        case 'string':
            return {
                canon: { kind: 'varchar', length: len, national },
            };
        case 'nvarchar':
        case 'nvarchar2':
        case 'national varchar':
        case 'national character varying':
            return {
                canon: { kind: 'varchar', length: len, national: true },
            };
        case 'tinytext':
            return { canon: text('tiny') };
        case 'mediumtext':
            return { canon: text('medium') };
        case 'longtext':
        case 'clob':
        case 'nclob':
        case 'citext':
            return { canon: text('long') };
        case 'ntext':
            return { canon: text('long', true) };
        case 'text':
            if (source === 'sqlserver') return { canon: text('long', false) };
            return {
                canon: text(
                    // MySQL's TEXT is 64 KB; everyone else's holds much more
                    source === 'mysql' || source === 'generic'
                        ? 'regular'
                        : 'long'
                ),
            };
    }

    // --- binary data
    switch (base) {
        case 'binary':
            return {
                canon: {
                    kind: 'binary',
                    length: len === 'max' ? undefined : len,
                },
            };
        case 'varbinary':
        case 'raw':
            return { canon: { kind: 'varbinary', length: len } };
        case 'tinyblob':
            return { canon: { kind: 'blob', size: 'tiny' } };
        case 'blob':
            return { canon: { kind: 'blob', size: 'regular' } };
        case 'mediumblob':
            return { canon: { kind: 'blob', size: 'medium' } };
        case 'longblob':
        case 'bytea':
        case 'image':
        case 'long raw':
            return { canon: { kind: 'blob', size: 'long' } };
        case 'rowversion':
            return {
                canon: { kind: 'binary', length: 8 },
                note: 'rowversion is SQL Server only; stored as BINARY(8) that nothing updates',
            };
    }

    // --- dates and times
    switch (base) {
        case 'date':
            return { canon: { kind: 'date' } };
        case 'time':
        case 'time without time zone':
            return { canon: { kind: 'time', tz: false } };
        case 'timetz':
        case 'time with time zone':
            return { canon: { kind: 'time', tz: true } };
        case 'timestamp':
            if (source === 'sqlserver')
                return {
                    canon: { kind: 'binary', length: 8 },
                    note: 'SQL Server timestamp is a row version, not a date; stored as BINARY(8) that nothing updates',
                };
            return { canon: { kind: 'datetime', tz: false } };
        case 'datetime':
        case 'datetime2':
        case 'smalldatetime':
        case 'timestamp without time zone':
            return { canon: { kind: 'datetime', tz: false } };
        case 'timestamptz':
        case 'timestamp with time zone':
        case 'datetimeoffset':
            return { canon: { kind: 'datetime', tz: true } };
    }

    // --- structured and special values
    switch (base) {
        case 'json':
            return {
                canon: { kind: 'json', binary: source !== 'postgresql' },
            };
        case 'jsonb':
            return { canon: { kind: 'json', binary: true } };
        case 'uuid':
        case 'uniqueidentifier':
        case 'guid':
            return { canon: { kind: 'uuid' } };
        case 'xml':
        case 'xmltype':
            return { canon: { kind: 'xml' } };
        case 'enum':
            if (values && values.length > 0)
                return { canon: { kind: 'enum', values } };
            return {
                canon: { kind: 'enum' },
                note: 'the ENUM values are not stored in the diagram, so any value is accepted',
            };
        case 'set':
            return asVarchar(
                255,
                'SET has no equivalent; stored as a comma separated string'
            );
    }

    // --- spatial
    if (source === 'mysql' || source === 'sqlserver') {
        if (
            [
                'geometry',
                'geography',
                'point',
                'linestring',
                'polygon',
                'multipoint',
                'multilinestring',
                'multipolygon',
                'geometrycollection',
            ].includes(base)
        ) {
            return { canon: { kind: 'geo', name: base } };
        }
    }

    // --- PostgreSQL types with no portable equivalent
    switch (base) {
        case 'interval':
            return asVarchar(64, 'interval has no equivalent; stored as text');
        case 'inet':
            return asVarchar(45, 'inet has no equivalent; stored as text');
        case 'cidr':
            return asVarchar(49, 'cidr has no equivalent; stored as text');
        case 'macaddr':
            return asVarchar(17, 'macaddr has no equivalent; stored as text');
        case 'macaddr8':
            return asVarchar(23, 'macaddr8 has no equivalent; stored as text');
        case 'point':
        case 'line':
        case 'lseg':
        case 'box':
        case 'path':
        case 'polygon':
        case 'circle':
            return asVarchar(
                255,
                `${base} is a PostgreSQL geometric type; stored as text`
            );
        case 'tsvector':
        case 'tsquery':
            return asText(
                `${base} is PostgreSQL full text search; stored as text`
            );
        case 'int4range':
        case 'int8range':
        case 'numrange':
        case 'tsrange':
        case 'tstzrange':
        case 'daterange':
            return asVarchar(255, `${base} is a range type; stored as text`);
        case 'user-defined':
        case 'user defined':
            return asText('a user-defined type; stored as text');
        case 'sql_variant':
        case 'sql variant':
        case 'hierarchyid':
        case 'cursor':
            return asText(`${base} has no equivalent; stored as text`);
    }
    if (/^(oid|reg\w+)$/.test(base)) {
        return {
            canon: { kind: 'int', bits: 64 },
            note: `${base} is a PostgreSQL internal type; stored as a number`,
        };
    }

    return asText(`unknown type "${rawName}"; stored as text`);
}
