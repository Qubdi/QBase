import type { Canon, TargetDialect, TextSize } from './canonical';

export interface RenderedType {
    sql: string;
    /** set when the type is only an approximation: what the user should know */
    note?: string;
    /** an ENUM the target has no type for: the values to enforce with a CHECK */
    enumCheck?: string[];
    /** a caveat that holds for the whole script, not just this column */
    general?: string;
}

export interface RenderContext {
    /** the column is in a key or an index, which limits how long it can be */
    isKey: boolean;
}

// What the target can use as an index key
const MYSQL_KEY_CHARS = 768; // 3072 bytes of utf8mb4
const MSSQL_KEY_NCHARS = 450; // 900 bytes
const MSSQL_KEY_CHARS = 900;

const MYSQL_TEXT: Record<TextSize, string> = {
    tiny: 'TINYTEXT',
    regular: 'TEXT',
    medium: 'MEDIUMTEXT',
    long: 'LONGTEXT',
};
const MYSQL_BLOB: Record<TextSize, string> = {
    tiny: 'TINYBLOB',
    regular: 'BLOB',
    medium: 'MEDIUMBLOB',
    long: 'LONGBLOB',
};

const quoteEnumValue = (v: string, backslash: boolean) =>
    `'${(backslash ? v.replace(/\\/g, '\\\\') : v).replace(/'/g, "''")}'`;

const decimalSql = (
    keyword: string,
    precision: number | undefined,
    scale: number | undefined,
    max: { precision: number; scale: number },
    unspecified: { precision: number; scale: number }
): { sql: string; note?: string } => {
    if (precision === undefined) {
        return {
            sql: `${keyword}(${unspecified.precision}, ${unspecified.scale})`,
            note: `no precision was given; used ${keyword}(${unspecified.precision}, ${unspecified.scale})`,
        };
    }
    const p = Math.min(precision, max.precision);
    const s = Math.min(scale ?? 0, max.scale, p);
    const clamped = p !== precision || s !== (scale ?? 0);
    return {
        sql: `${keyword}(${p}, ${s})`,
        note: clamped
            ? `DECIMAL(${precision}, ${scale ?? 0}) is larger than this database allows; used ${keyword}(${p}, ${s})`
            : undefined,
    };
};

function toPostgres(c: Canon): RenderedType {
    switch (c.kind) {
        case 'int': {
            if (!c.unsigned)
                return {
                    sql:
                        c.bits <= 16
                            ? 'smallint'
                            : c.bits <= 32
                              ? 'integer'
                              : 'bigint',
                };
            // no unsigned types: use the next size up
            if (c.bits <= 8) return { sql: 'smallint' };
            if (c.bits <= 32)
                return { sql: c.bits === 32 ? 'bigint' : 'integer' };
            return { sql: 'numeric(20, 0)' };
        }
        case 'decimal':
            if (c.precision === undefined) return { sql: 'numeric' };
            return {
                sql:
                    c.scale === undefined
                        ? `numeric(${c.precision})`
                        : `numeric(${c.precision}, ${c.scale})`,
            };
        case 'float':
            return { sql: c.bits === 32 ? 'real' : 'double precision' };
        case 'bool':
            return { sql: 'boolean' };
        case 'char':
            return { sql: `char(${c.length ?? 1})` };
        case 'varchar':
            return {
                sql:
                    typeof c.length === 'number'
                        ? `varchar(${c.length})`
                        : 'text',
            };
        case 'text':
            return { sql: 'text' };
        case 'binary':
        case 'varbinary':
        case 'blob':
            return { sql: 'bytea' };
        case 'date':
            return { sql: 'date' };
        case 'time':
            return { sql: c.tz ? 'timetz' : 'time' };
        case 'datetime':
            return { sql: c.tz ? 'timestamptz' : 'timestamp' };
        case 'json':
            return { sql: c.binary ? 'jsonb' : 'json' };
        case 'uuid':
            return { sql: 'uuid' };
        case 'xml':
            return { sql: 'xml' };
        case 'enum':
            return {
                sql: 'varchar(255)',
                enumCheck: c.values,
            };
        case 'bitstring':
            return {
                sql: c.length ? `bit(${c.length})` : 'varbit',
                note: 'a bit string here, not a number',
            };
        case 'geo':
            return {
                sql: 'bytea',
                note: `${c.name} is stored as bytea; PostGIS is not assumed`,
            };
        case 'array':
            return { sql: `${toPostgres(c.of).sql}[]` };
    }
}

function toMySQL(c: Canon, ctx: RenderContext): RenderedType {
    switch (c.kind) {
        case 'int': {
            const name = {
                8: 'TINYINT',
                16: 'SMALLINT',
                24: 'MEDIUMINT',
                32: 'INT',
                64: 'BIGINT',
            }[c.bits];
            return { sql: c.unsigned ? `${name} UNSIGNED` : name };
        }
        case 'decimal': {
            const d = decimalSql(
                'DECIMAL',
                c.precision,
                c.scale,
                { precision: 65, scale: 30 },
                { precision: 38, scale: 10 }
            );
            return d;
        }
        case 'float':
            return { sql: c.bits === 32 ? 'FLOAT' : 'DOUBLE' };
        case 'bool':
            return { sql: 'TINYINT(1)' };
        case 'char': {
            const n = c.length ?? 1;
            if (n <= 255) return { sql: `CHAR(${n})` };
            return {
                sql: n <= 16383 ? `VARCHAR(${n})` : 'MEDIUMTEXT',
                note: `CHAR(${n}) is longer than MySQL allows; stored as a variable length column`,
            };
        }
        case 'varchar': {
            if (typeof c.length === 'number') {
                if (ctx.isKey && c.length > MYSQL_KEY_CHARS) {
                    return {
                        sql: `VARCHAR(${MYSQL_KEY_CHARS})`,
                        note: `part of a key, which MySQL limits to ${MYSQL_KEY_CHARS} characters; was VARCHAR(${c.length})`,
                    };
                }
                if (c.length <= 16383) return { sql: `VARCHAR(${c.length})` };
                return {
                    sql: 'MEDIUMTEXT',
                    note: `VARCHAR(${c.length}) is longer than MySQL allows; stored as MEDIUMTEXT`,
                };
            }
            if (ctx.isKey) {
                return {
                    sql: 'VARCHAR(255)',
                    note: 'part of a key, which MySQL cannot do for an unlimited text column; limited to 255 characters',
                };
            }
            return { sql: 'LONGTEXT' };
        }
        case 'text':
            if (ctx.isKey) {
                return {
                    sql: 'VARCHAR(255)',
                    note: 'part of a key, which MySQL cannot do for a TEXT column; limited to 255 characters',
                };
            }
            return { sql: MYSQL_TEXT[c.size] };
        case 'binary': {
            const n = c.length ?? 1;
            if (n <= 255) return { sql: `BINARY(${n})` };
            return {
                sql: n <= 65535 ? `VARBINARY(${n})` : 'LONGBLOB',
                note: `BINARY(${n}) is longer than MySQL allows; stored as a variable length column`,
            };
        }
        case 'varbinary':
            if (typeof c.length === 'number' && c.length <= 65535)
                return { sql: `VARBINARY(${c.length})` };
            if (ctx.isKey)
                return {
                    sql: 'VARBINARY(255)',
                    note: 'part of a key, which MySQL cannot do for a BLOB column; limited to 255 bytes',
                };
            return { sql: 'LONGBLOB' };
        case 'blob':
            if (ctx.isKey)
                return {
                    sql: 'VARBINARY(255)',
                    note: 'part of a key, which MySQL cannot do for a BLOB column; limited to 255 bytes',
                };
            return { sql: MYSQL_BLOB[c.size] };
        case 'date':
            return { sql: 'DATE' };
        case 'time':
            return {
                sql: 'TIME',
                note: c.tz ? 'MySQL TIME has no time zone' : undefined,
            };
        case 'datetime':
            return {
                sql: 'DATETIME',
                note: c.tz
                    ? 'MySQL DATETIME has no time zone; store UTC'
                    : undefined,
            };
        case 'json':
            return { sql: 'JSON' };
        case 'uuid':
            return { sql: 'CHAR(36)' };
        case 'xml':
            return { sql: 'LONGTEXT', note: 'XML is stored as text' };
        case 'enum':
            if (c.values && c.values.length > 0) {
                return {
                    sql: `ENUM(${c.values.map((v) => quoteEnumValue(v, true)).join(', ')})`,
                };
            }
            return { sql: 'VARCHAR(255)' };
        case 'bitstring': {
            const n = c.length ?? 1;
            if (n <= 64) return { sql: `BIT(${n})` };
            return {
                sql: `BINARY(${Math.ceil(n / 8)})`,
                note: `BIT(${n}) is longer than MySQL allows; stored as bytes`,
            };
        }
        case 'geo':
            return {
                sql: c.name === 'geography' ? 'GEOMETRY' : c.name.toUpperCase(),
                note:
                    c.name === 'geography'
                        ? 'MySQL has no geography type; used GEOMETRY'
                        : undefined,
            };
        case 'array':
            return { sql: 'JSON' };
    }
}

function toSqlServer(c: Canon, ctx: RenderContext): RenderedType {
    switch (c.kind) {
        case 'int':
            if (!c.unsigned)
                return {
                    sql:
                        c.bits <= 16
                            ? 'SMALLINT'
                            : c.bits <= 32
                              ? 'INT'
                              : 'BIGINT',
                };
            if (c.bits <= 8) return { sql: 'TINYINT' };
            if (c.bits <= 24) return { sql: 'INT' };
            if (c.bits === 32) return { sql: 'BIGINT' };
            return { sql: 'DECIMAL(20, 0)' };
        case 'decimal':
            return decimalSql(
                'DECIMAL',
                c.precision,
                c.scale,
                { precision: 38, scale: 38 },
                { precision: 38, scale: 10 }
            );
        case 'float':
            return { sql: c.bits === 32 ? 'REAL' : 'FLOAT' };
        case 'bool':
            return { sql: 'BIT' };
        case 'char': {
            const n = c.length ?? 1;
            const limit = c.national ? 4000 : 8000;
            if (n <= limit)
                return { sql: `${c.national ? 'NCHAR' : 'CHAR'}(${n})` };
            return {
                sql: c.national ? 'NVARCHAR(MAX)' : 'VARCHAR(MAX)',
                note: `CHAR(${n}) is longer than SQL Server allows; stored as MAX`,
            };
        }
        case 'varchar': {
            const name = c.national ? 'NVARCHAR' : 'VARCHAR';
            const keyLimit = c.national ? MSSQL_KEY_NCHARS : MSSQL_KEY_CHARS;
            const limit = c.national ? 4000 : 8000;
            if (typeof c.length === 'number') {
                if (ctx.isKey && c.length > keyLimit) {
                    return {
                        sql: `${name}(${keyLimit})`,
                        note: `part of a key, which SQL Server limits to ${keyLimit} characters; was ${name}(${c.length})`,
                    };
                }
                if (c.length <= limit) return { sql: `${name}(${c.length})` };
                return {
                    sql: `${name}(MAX)`,
                    note: `${name}(${c.length}) is longer than SQL Server allows; stored as MAX`,
                };
            }
            if (ctx.isKey) {
                return {
                    sql: `${name}(${keyLimit})`,
                    note: `part of a key, which SQL Server cannot do for ${name}(MAX); limited to ${keyLimit} characters`,
                };
            }
            return { sql: `${name}(MAX)` };
        }
        case 'text': {
            const name = c.national ? 'NVARCHAR' : 'VARCHAR';
            const keyLimit = c.national ? MSSQL_KEY_NCHARS : MSSQL_KEY_CHARS;
            if (ctx.isKey) {
                return {
                    sql: `${name}(${keyLimit})`,
                    note: `part of a key, which SQL Server cannot do for ${name}(MAX); limited to ${keyLimit} characters`,
                };
            }
            return { sql: `${name}(MAX)` };
        }
        case 'binary': {
            const n = c.length ?? 1;
            if (n <= 8000) return { sql: `BINARY(${n})` };
            return {
                sql: 'VARBINARY(MAX)',
                note: `BINARY(${n}) is longer than SQL Server allows; stored as MAX`,
            };
        }
        case 'varbinary':
            if (typeof c.length === 'number' && c.length <= 8000)
                return { sql: `VARBINARY(${c.length})` };
            if (ctx.isKey)
                return {
                    sql: 'VARBINARY(900)',
                    note: 'part of a key, which SQL Server cannot do for VARBINARY(MAX); limited to 900 bytes',
                };
            return { sql: 'VARBINARY(MAX)' };
        case 'blob':
            if (ctx.isKey)
                return {
                    sql: 'VARBINARY(900)',
                    note: 'part of a key, which SQL Server cannot do for VARBINARY(MAX); limited to 900 bytes',
                };
            return { sql: 'VARBINARY(MAX)' };
        case 'date':
            return { sql: 'DATE' };
        case 'time':
            return {
                sql: 'TIME',
                note: c.tz ? 'SQL Server TIME has no time zone' : undefined,
            };
        case 'datetime':
            return { sql: c.tz ? 'DATETIMEOFFSET' : 'DATETIME2' };
        case 'json':
            if (ctx.isKey)
                return {
                    sql: `NVARCHAR(${MSSQL_KEY_NCHARS})`,
                    note: `part of a key; JSON is stored as text limited to ${MSSQL_KEY_NCHARS} characters`,
                };
            return {
                sql: 'NVARCHAR(MAX)',
                note: 'JSON is stored as text; SQL Server 2022 has no JSON type',
            };
        case 'uuid':
            return { sql: 'UNIQUEIDENTIFIER' };
        case 'xml':
            return { sql: 'XML' };
        case 'enum':
            return { sql: 'NVARCHAR(255)', enumCheck: c.values };
        case 'bitstring': {
            const n = c.length ?? 1;
            if (n === 1) return { sql: 'BIT' };
            return {
                sql: `BINARY(${Math.min(Math.ceil(n / 8), 8000)})`,
                note: `BIT(${n}) is stored as bytes`,
            };
        }
        case 'geo':
            return { sql: c.name === 'geography' ? 'GEOGRAPHY' : 'GEOMETRY' };
        case 'array':
            return {
                sql: 'NVARCHAR(MAX)',
                note: 'stored as JSON text; SQL Server has no array type',
            };
    }
}

function toSQLite(c: Canon): RenderedType {
    switch (c.kind) {
        case 'int':
            return { sql: 'INTEGER' };
        case 'decimal':
            return {
                sql:
                    c.precision === undefined
                        ? 'NUMERIC'
                        : `DECIMAL(${c.precision}, ${c.scale ?? 0})`,
                general:
                    'SQLite has no fixed precision decimal type: DECIMAL columns have NUMERIC affinity and are stored as integers or floating point numbers',
            };
        case 'float':
            return { sql: 'REAL' };
        case 'bool':
            return { sql: 'BOOLEAN' };
        case 'char':
            return { sql: `CHAR(${c.length ?? 1})` };
        case 'varchar':
            return {
                sql:
                    typeof c.length === 'number'
                        ? `VARCHAR(${c.length})`
                        : 'TEXT',
            };
        case 'text':
            return { sql: 'TEXT' };
        case 'binary':
        case 'varbinary':
        case 'blob':
            return { sql: 'BLOB' };
        case 'date':
            return { sql: 'DATE' };
        case 'time':
            return {
                sql: 'TIME',
                note: c.tz ? 'SQLite has no time zone support' : undefined,
            };
        case 'datetime':
            return {
                sql: 'DATETIME',
                note: c.tz
                    ? 'SQLite has no time zone support; store UTC'
                    : undefined,
            };
        case 'json':
            return { sql: 'TEXT' };
        case 'uuid':
            return { sql: 'CHAR(36)' };
        case 'xml':
            return { sql: 'TEXT' };
        case 'enum':
            return { sql: 'TEXT', enumCheck: c.values };
        case 'bitstring': {
            const n = c.length ?? 1;
            return n <= 63
                ? {
                      sql: 'INTEGER',
                      note: `BIT(${n}) is stored as a number`,
                  }
                : { sql: 'BLOB', note: `BIT(${n}) is stored as bytes` };
        }
        case 'geo':
            return { sql: 'BLOB' };
        case 'array':
            return { sql: 'TEXT', note: 'stored as JSON text' };
    }
}

export function renderType(
    target: TargetDialect,
    canon: Canon,
    ctx: RenderContext
): RenderedType {
    switch (target) {
        case 'postgresql':
            return toPostgres(canon);
        case 'mysql':
            return toMySQL(canon, ctx);
        case 'sqlserver':
            return toSqlServer(canon, ctx);
        case 'sqlite':
            return toSQLite(canon);
    }
}

/** True for the types SQL Server and MySQL will not let a number-generating column use. */
export const isIntegerLike = (c: Canon): boolean => c.kind === 'int';
