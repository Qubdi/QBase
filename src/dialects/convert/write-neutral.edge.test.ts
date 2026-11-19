import { describe, expect, it } from 'vitest';
import type { Flavour, Neutral } from './contract';
import { writeNeutral } from './write-neutral';

const FLAVOURS: Flavour[] = [
    'postgres',
    'mysql',
    'sqlserver',
    'sqlite',
    'oracle',
];

const text = (n: Neutral, flavour: Flavour, keySized = false) =>
    writeNeutral(n, flavour, { keySized }).text;

/** One row per flavour, in FLAVOURS order. */
const row = (n: Neutral, keySized = false) =>
    FLAVOURS.map((f) => text(n, f, keySized));

describe('writeNeutral: integers', () => {
    it('writes every size, signed and unsigned, in every dialect', () => {
        const bits = [8, 16, 24, 32, 64] as const;
        expect(bits.map((b) => row({ kind: 'int', bits: b }))).toEqual([
            ['smallint', 'TINYINT', 'SMALLINT', 'INTEGER', 'NUMBER(3)'],
            ['smallint', 'SMALLINT', 'SMALLINT', 'INTEGER', 'NUMBER(5)'],
            ['integer', 'MEDIUMINT', 'INT', 'INTEGER', 'NUMBER(7)'],
            ['integer', 'INT', 'INT', 'INTEGER', 'NUMBER(10)'],
            ['bigint', 'BIGINT', 'BIGINT', 'INTEGER', 'NUMBER(19)'],
        ]);
        expect(
            bits.map((b) => row({ kind: 'int', bits: b, unsigned: true }))
        ).toEqual([
            ['smallint', 'TINYINT UNSIGNED', 'TINYINT', 'INTEGER', 'NUMBER(3)'],
            ['integer', 'SMALLINT UNSIGNED', 'INT', 'INTEGER', 'NUMBER(5)'],
            ['integer', 'MEDIUMINT UNSIGNED', 'INT', 'INTEGER', 'NUMBER(8)'],
            ['bigint', 'INT UNSIGNED', 'BIGINT', 'INTEGER', 'NUMBER(10)'],
            [
                'numeric(20, 0)',
                'BIGINT UNSIGNED',
                'DECIMAL(20, 0)',
                'INTEGER',
                'NUMBER(20)',
            ],
        ]);
    });

    it('marks an int as the native numbered type', () => {
        for (const f of FLAVOURS)
            expect(
                writeNeutral({ kind: 'int', bits: 32 }, f, { keySized: false })
                    .integer
            ).toBe(true);
    });
});

describe('writeNeutral: decimals', () => {
    it('writes a decimal with no precision', () => {
        expect(row({ kind: 'decimal' })).toEqual([
            'numeric',
            'DECIMAL(38, 10)',
            'DECIMAL(38, 10)',
            'NUMERIC',
            'NUMBER',
        ]);
    });

    it('writes precision only and precision with scale', () => {
        expect(row({ kind: 'decimal', precision: 8 })).toEqual([
            'numeric(8)',
            'DECIMAL(8)',
            'DECIMAL(8)',
            'DECIMAL(8)',
            'NUMBER(8)',
        ]);
        expect(row({ kind: 'decimal', precision: 8, scale: 3 })).toEqual([
            'numeric(8, 3)',
            'DECIMAL(8, 3)',
            'DECIMAL(8, 3)',
            'DECIMAL(8, 3)',
            'NUMBER(8, 3)',
        ]);
    });

    it('reduces a precision and scale the target cannot hold, with notes', () => {
        const big: Neutral = { kind: 'decimal', precision: 70, scale: 40 };
        expect(writeNeutral(big, 'mysql', { keySized: false })).toEqual({
            text: 'DECIMAL(65, 30)',
            notes: ['precision 70 reduced to 65', 'scale 40 reduced to 30'],
        });
        expect(writeNeutral(big, 'sqlserver', { keySized: false })).toEqual({
            text: 'DECIMAL(38, 38)',
            notes: ['precision 70 reduced to 38', 'scale 40 reduced to 38'],
        });
        expect(writeNeutral(big, 'oracle', { keySized: false })).toEqual({
            text: 'NUMBER(38, 38)',
            notes: ['precision 70 reduced to 38', 'scale 40 reduced to 38'],
        });
        expect(text(big, 'postgres')).toBe('numeric(70, 40)');
    });
});

describe('writeNeutral: floats, booleans and dates', () => {
    it('writes 32 and 64 bit floats', () => {
        expect(row({ kind: 'float', bits: 32 })).toEqual([
            'real',
            'FLOAT',
            'REAL',
            'REAL',
            'BINARY_FLOAT',
        ]);
        expect(row({ kind: 'float', bits: 64 })).toEqual([
            'double precision',
            'DOUBLE',
            'FLOAT',
            'REAL',
            'BINARY_DOUBLE',
        ]);
    });

    it('writes a boolean, with a note for Oracle', () => {
        expect(row({ kind: 'bool' })).toEqual([
            'boolean',
            'TINYINT(1)',
            'BIT',
            'BOOLEAN',
            'NUMBER(1)',
        ]);
        expect(
            writeNeutral({ kind: 'bool' }, 'oracle', { keySized: false }).notes
        ).toHaveLength(1);
    });

    it('writes date, time and datetime with and without zone', () => {
        expect(row({ kind: 'date' })).toEqual([
            'date',
            'DATE',
            'DATE',
            'DATE',
            'DATE',
        ]);
        expect(row({ kind: 'time', zone: false })).toEqual([
            'time',
            'TIME',
            'TIME',
            'TIME',
            'TIMESTAMP',
        ]);
        expect(row({ kind: 'time', zone: true })).toEqual([
            'timetz',
            'TIME',
            'TIME',
            'TIME',
            'TIMESTAMP WITH TIME ZONE',
        ]);
        expect(row({ kind: 'datetime', zone: false })).toEqual([
            'timestamp',
            'DATETIME',
            'DATETIME2',
            'DATETIME',
            'TIMESTAMP',
        ]);
        expect(row({ kind: 'datetime', zone: true })).toEqual([
            'timestamptz',
            'DATETIME',
            'DATETIMEOFFSET',
            'DATETIME',
            'TIMESTAMP WITH TIME ZONE',
        ]);
    });

    it('notes a lost time zone as approximate', () => {
        const r = writeNeutral({ kind: 'time', zone: true }, 'mysql', {
            keySized: false,
        });
        expect(r).toMatchObject({
            approximate: true,
            notes: ['time zone is lost: stored without a zone'],
        });
        expect(
            writeNeutral({ kind: 'time', zone: true }, 'sqlserver', {
                keySized: false,
            }).approximate
        ).toBeUndefined();
        expect(
            writeNeutral({ kind: 'datetime', zone: true }, 'sqlite', {
                keySized: false,
            }).approximate
        ).toBe(true);
    });
});

describe('writeNeutral: character types', () => {
    it('writes char by length and nationality', () => {
        expect(row({ kind: 'char' })).toEqual([
            'char(1)',
            'CHAR(1)',
            'CHAR(1)',
            'CHAR(1)',
            'CHAR(1 CHAR)',
        ]);
        expect(row({ kind: 'char', length: 300 })).toEqual([
            'char(300)',
            'VARCHAR(300)',
            'CHAR(300)',
            'CHAR(300)',
            'CHAR(300 CHAR)',
        ]);
        expect(row({ kind: 'char', length: 20000 })).toEqual([
            'char(20000)',
            'MEDIUMTEXT',
            'VARCHAR(MAX)',
            'CHAR(20000)',
            'CLOB',
        ]);
        expect(row({ kind: 'char', length: 5, national: true })).toEqual([
            'char(5)',
            'CHAR(5)',
            'NCHAR(5)',
            'CHAR(5)',
            'NCHAR(5)',
        ]);
        expect(row({ kind: 'char', length: 5000, national: true })).toEqual([
            'char(5000)',
            'VARCHAR(5000)',
            'NVARCHAR(MAX)',
            'CHAR(5000)',
            'NCLOB',
        ]);
    });

    it('writes varchar by length, max and nationality', () => {
        expect(row({ kind: 'varchar', length: 50 })).toEqual([
            'varchar(50)',
            'VARCHAR(50)',
            'VARCHAR(50)',
            'VARCHAR(50)',
            'VARCHAR2(50 CHAR)',
        ]);
        expect(row({ kind: 'varchar', length: 'max' })).toEqual([
            'text',
            'LONGTEXT',
            'VARCHAR(MAX)',
            'TEXT',
            'CLOB',
        ]);
        expect(row({ kind: 'varchar', length: 20000, national: true })).toEqual(
            [
                'varchar(20000)',
                'MEDIUMTEXT',
                'NVARCHAR(MAX)',
                'VARCHAR(20000)',
                'NCLOB',
            ]
        );
        expect(row({ kind: 'varchar', length: 100, national: true })).toEqual([
            'varchar(100)',
            'VARCHAR(100)',
            'NVARCHAR(100)',
            'VARCHAR(100)',
            'NVARCHAR2(100)',
        ]);
    });

    it('shortens key columns so they can be indexed', () => {
        expect(row({ kind: 'varchar' }, true)).toEqual([
            'text',
            'VARCHAR(768)',
            'VARCHAR(900)',
            'TEXT',
            'VARCHAR2(4000 CHAR)',
        ]);
        expect(row({ kind: 'varchar', length: 1000 }, true)).toEqual([
            'varchar(1000)',
            'VARCHAR(768)',
            'VARCHAR(900)',
            'VARCHAR(1000)',
            'VARCHAR2(1000 CHAR)',
        ]);
        expect(
            row({ kind: 'varchar', length: 3000, national: true }, true)
        ).toEqual([
            'varchar(3000)',
            'VARCHAR(768)',
            'NVARCHAR(450)',
            'VARCHAR(3000)',
            'NVARCHAR2(2000)',
        ]);
        expect(row({ kind: 'text', size: 'long' }, true)).toEqual([
            'text',
            'VARCHAR(768)',
            'NVARCHAR(450)',
            'TEXT',
            'VARCHAR2(4000 CHAR)',
        ]);
        expect(row({ kind: 'json', binary: true }, true)).toEqual([
            'jsonb',
            'JSON',
            'NVARCHAR(450)',
            'TEXT',
            'VARCHAR2(4000 CHAR)',
        ]);
    });

    it('writes text sizes', () => {
        expect(
            (['tiny', 'regular', 'medium', 'long'] as const).map((size) =>
                text({ kind: 'text', size }, 'mysql')
            )
        ).toEqual(['TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT']);
        expect(row({ kind: 'text', size: 'regular' })).toEqual([
            'text',
            'TEXT',
            'NVARCHAR(MAX)',
            'TEXT',
            'CLOB',
        ]);
    });
});

describe('writeNeutral: binary types', () => {
    it('writes binary with and without a length', () => {
        expect(row({ kind: 'binary', varying: true })).toEqual([
            'bytea',
            'LONGBLOB',
            'VARBINARY(MAX)',
            'BLOB',
            'BLOB',
        ]);
        expect(row({ kind: 'binary', varying: false })).toEqual([
            'bytea',
            'BLOB',
            'VARBINARY(MAX)',
            'BLOB',
            'BLOB',
        ]);
        expect(row({ kind: 'binary', length: 16, varying: false })).toEqual([
            'bytea',
            'BINARY(16)',
            'BINARY(16)',
            'BLOB',
            'RAW(16)',
        ]);
        expect(row({ kind: 'binary', length: 3000, varying: true })).toEqual([
            'bytea',
            'VARBINARY(3000)',
            'VARBINARY(3000)',
            'BLOB',
            'BLOB',
        ]);
    });

    it('writes blob sizes', () => {
        expect(
            (['tiny', 'regular', 'medium', 'long'] as const).map((size) =>
                text({ kind: 'blob', size }, 'mysql')
            )
        ).toEqual(['TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB']);
        expect(row({ kind: 'blob', size: 'regular' })).toEqual([
            'bytea',
            'BLOB',
            'VARBINARY(MAX)',
            'BLOB',
            'BLOB',
        ]);
    });

    it('writes bit strings by length', () => {
        expect(row({ kind: 'bits', length: 1 })).toEqual([
            'bit(1)',
            'BIT(1)',
            'BIT',
            'INTEGER',
            'RAW(1)',
        ]);
        expect(row({ kind: 'bits', length: 100 })).toEqual([
            'bit(100)',
            'BINARY(13)',
            'BINARY(13)',
            'BLOB',
            'RAW(13)',
        ]);
        expect(text({ kind: 'bits', length: 64 }, 'mysql')).toBe('BIT(64)');
        expect(text({ kind: 'bits', length: 20000 }, 'oracle')).toBe('BLOB');
    });
});

describe('writeNeutral: json, uuid, xml, enum, geo, array, other', () => {
    it('writes json', () => {
        expect(row({ kind: 'json', binary: false })).toEqual([
            'json',
            'JSON',
            'NVARCHAR(MAX)',
            'TEXT',
            'CLOB',
        ]);
    });

    it('writes uuid and xml', () => {
        expect(row({ kind: 'uuid' })).toEqual([
            'uuid',
            'CHAR(36)',
            'UNIQUEIDENTIFIER',
            'CHAR(36)',
            'RAW(16)',
        ]);
        expect(row({ kind: 'xml' })).toEqual([
            'xml',
            'LONGTEXT',
            'XML',
            'TEXT',
            'XMLTYPE',
        ]);
    });

    it('writes an enum with known values', () => {
        const n: Neutral = {
            kind: 'enum',
            values: ['a', "it's", 'back\\slash'],
        };
        expect(text(n, 'mysql')).toBe("ENUM('a', 'it''s', 'back\\\\slash')");
        for (const f of [
            'postgres',
            'sqlserver',
            'sqlite',
            'oracle',
        ] as const) {
            const r = writeNeutral(n, f, { keySized: false });
            expect(r.enumValues).toEqual(n.values);
            expect(r.notes).toEqual([]);
        }
    });

    it('writes an enum with unknown values, with a note', () => {
        expect(row({ kind: 'enum' })).toEqual([
            'varchar(255)',
            'VARCHAR(255)',
            'NVARCHAR(255)',
            'TEXT',
            'VARCHAR2(255 CHAR)',
        ]);
        for (const f of FLAVOURS)
            expect(
                writeNeutral({ kind: 'enum' }, f, { keySized: false }).notes
            ).toHaveLength(1);
    });

    it('writes geometry and geography', () => {
        expect(row({ kind: 'geo', geography: false })).toEqual([
            'bytea',
            'GEOMETRY',
            'GEOMETRY',
            'BLOB',
            'SDO_GEOMETRY',
        ]);
        expect(row({ kind: 'geo', geography: true })).toEqual([
            'bytea',
            'GEOMETRY',
            'GEOGRAPHY',
            'BLOB',
            'SDO_GEOMETRY',
        ]);
        expect(
            writeNeutral({ kind: 'geo', geography: true }, 'mysql', {
                keySized: false,
            }).notes
        ).toEqual(['geography converted to GEOMETRY']);
    });

    it('writes arrays natively only in PostgreSQL, keeping inner notes', () => {
        const n: Neutral = {
            kind: 'array',
            of: { kind: 'geo', geography: false },
        };
        expect(row(n)).toEqual([
            'bytea[]',
            'JSON',
            'NVARCHAR(MAX)',
            'TEXT',
            'CLOB',
        ]);
        expect(
            writeNeutral(n, 'postgres', { keySized: false }).notes
        ).toHaveLength(1);
        expect(
            text(
                {
                    kind: 'array',
                    of: { kind: 'array', of: { kind: 'int', bits: 32 } },
                },
                'postgres'
            )
        ).toBe('integer[][]');
    });

    it('writes an unknown type as the widest text', () => {
        expect(row({ kind: 'other', note: 'x' })).toEqual([
            'text',
            'LONGTEXT',
            'NVARCHAR(MAX)',
            'text',
            'CLOB',
        ]);
    });
});
