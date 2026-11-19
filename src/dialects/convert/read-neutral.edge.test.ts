import { describe, expect, it } from 'vitest';
import type { Column } from '@/core/model/column';
import type { UserType } from '@/core/model/user-type';
import type { Flavour, Neutral } from './contract';
import { readNeutral } from './read-neutral';

const column = (name: string, extra: Partial<Column> = {}): Column => ({
    id: 'c1',
    name: 'c',
    type: { id: name, name },
    primaryKey: false,
    unique: false,
    nullable: true,
    createdAt: 0,
    ...extra,
});

const read = (
    type: string,
    flavour: Flavour = 'postgres',
    extra: Partial<Column> = {},
    userTypes: readonly UserType[] = []
) => readNeutral(column(type, extra), flavour, userTypes);

const neutral = (
    type: string,
    flavour: Flavour = 'postgres',
    extra: Partial<Column> = {}
): Neutral => read(type, flavour, extra).neutral;

describe('readNeutral: serial types number rows', () => {
    it.each([
        ['serial', 32],
        ['serial4', 32],
        ['bigserial', 64],
        ['serial8', 64],
        ['smallserial', 16],
        ['serial2', 16],
    ] as const)('%s is a %i-bit numbered int', (type, bits) => {
        expect(read(type)).toEqual({
            neutral: { kind: 'int', bits },
            numbered: { bits },
        });
    });
});

describe('readNeutral: integers', () => {
    it('reads tinyint as unsigned in SQL Server only', () => {
        expect(neutral('tinyint', 'sqlserver')).toEqual({
            kind: 'int',
            bits: 8,
            unsigned: true,
        });
        expect(neutral('tinyint', 'mysql')).toEqual({
            kind: 'int',
            bits: 8,
            unsigned: false,
        });
        expect(neutral('TINYINT UNSIGNED', 'mysql')).toEqual({
            kind: 'int',
            bits: 8,
            unsigned: true,
        });
    });

    it.each([
        ['smallint', 16],
        ['int2', 16],
        ['year', 16],
        ['mediumint', 24],
        ['int', 32],
        ['int4', 32],
        ['bigint', 64],
        ['int8', 64],
    ] as const)('%s has %i bits', (type, bits) => {
        expect(neutral(type, 'mysql')).toEqual({
            kind: 'int',
            bits,
            unsigned: false,
        });
    });

    it('reads INTEGER as 64 bits in SQLite only', () => {
        expect(neutral('integer', 'sqlite')).toMatchObject({ bits: 64 });
        expect(neutral('INTEGER', 'postgres')).toMatchObject({ bits: 32 });
    });

    it('ignores zerofill and signed and keeps unsigned', () => {
        expect(neutral('int unsigned zerofill', 'mysql')).toEqual({
            kind: 'int',
            bits: 32,
            unsigned: true,
        });
        expect(neutral('bigint signed', 'mysql')).toEqual({
            kind: 'int',
            bits: 64,
            unsigned: false,
        });
    });
});

describe('readNeutral: Oracle NUMBER', () => {
    it.each([
        [
            undefined,
            undefined,
            { kind: 'decimal', precision: undefined, scale: undefined },
        ],
        [3, 0, { kind: 'int', bits: 16 }],
        [9, undefined, { kind: 'int', bits: 32 }],
        [18, 0, { kind: 'int', bits: 64 }],
        [30, 0, { kind: 'decimal', precision: 30, scale: 0 }],
        [10, 2, { kind: 'decimal', precision: 10, scale: 2 }],
    ])('NUMBER(%s, %s)', (precision, scale, expected) => {
        expect(neutral('NUMBER', 'oracle', { precision, scale })).toEqual(
            expected
        );
    });

    it('reads NUMBER as a decimal outside Oracle', () => {
        expect(neutral('number', 'postgres', { precision: 5 })).toEqual({
            kind: 'decimal',
            precision: 5,
            scale: undefined,
        });
    });
});

describe('readNeutral: decimals and money', () => {
    it.each(['decimal', 'numeric', 'dec'])(
        '%s keeps precision and scale',
        (t) => {
            expect(neutral(t, 'mysql', { precision: 12, scale: 4 })).toEqual({
                kind: 'decimal',
                precision: 12,
                scale: 4,
            });
        }
    );

    it('converts money with a note, by source', () => {
        expect(read('money', 'sqlserver')).toMatchObject({
            neutral: { kind: 'decimal', precision: 19, scale: 4 },
            approximate: true,
        });
        expect(read('money', 'postgres').neutral).toEqual({
            kind: 'decimal',
            precision: 19,
            scale: 2,
        });
        expect(read('smallmoney', 'sqlserver')).toMatchObject({
            neutral: { kind: 'decimal', precision: 10, scale: 4 },
            note: 'smallmoney converted to a fixed-point number',
        });
    });
});

describe('readNeutral: floats', () => {
    it('reads REAL by source', () => {
        expect(neutral('real', 'postgres')).toEqual({
            kind: 'float',
            bits: 32,
        });
        expect(neutral('real', 'sqlite')).toEqual({ kind: 'float', bits: 64 });
        expect(neutral('real', 'mysql')).toEqual({ kind: 'float', bits: 64 });
    });

    it('reads FLOAT(p) by source and precision', () => {
        expect(neutral('float', 'mysql')).toEqual({ kind: 'float', bits: 32 });
        expect(neutral('float', 'mysql', { precision: 30 })).toEqual({
            kind: 'float',
            bits: 64,
        });
        expect(neutral('float', 'sqlserver')).toEqual({
            kind: 'float',
            bits: 64,
        });
        expect(neutral('float', 'sqlserver', { precision: 24 })).toEqual({
            kind: 'float',
            bits: 32,
        });
        expect(neutral('float', 'oracle', { precision: 10 })).toEqual({
            kind: 'float',
            bits: 32,
        });
        expect(neutral('float', 'postgres', { precision: 10 })).toEqual({
            kind: 'float',
            bits: 64,
        });
    });

    it.each([
        ['float4', 32],
        ['double', 64],
        ['double precision', 64],
        ['float8', 64],
        ['binary_float', 32],
        ['binary_double', 64],
    ] as const)('%s has %i bits', (t, bits) => {
        expect(neutral(t, 'oracle')).toEqual({ kind: 'float', bits });
    });
});

describe('readNeutral: booleans and bits', () => {
    it('reads bool and boolean', () => {
        expect(neutral('bool')).toEqual({ kind: 'bool' });
        expect(neutral('BOOLEAN', 'sqlite')).toEqual({ kind: 'bool' });
    });

    it('reads BIT as a boolean in SQL Server, SQLite and for one bit', () => {
        expect(neutral('bit', 'sqlserver', { length: 8 })).toEqual({
            kind: 'bool',
        });
        expect(neutral('bit', 'sqlite', { length: 8 })).toEqual({
            kind: 'bool',
        });
        expect(neutral('bit', 'mysql')).toEqual({ kind: 'bool' });
        expect(neutral('bit', 'mysql', { length: 8 })).toEqual({
            kind: 'bits',
            length: 8,
        });
    });

    it('reads varbit and bit varying', () => {
        expect(neutral('varbit', 'postgres', { length: 16 })).toEqual({
            kind: 'bits',
            length: 16,
        });
        expect(neutral('bit varying')).toEqual({ kind: 'bits', length: 1 });
    });
});

describe('readNeutral: character types', () => {
    it('reads char spellings with their length', () => {
        for (const t of ['char', 'character', 'bpchar'])
            expect(neutral(t, 'postgres', { length: 3 })).toEqual({
                kind: 'char',
                length: 3,
            });
        expect(neutral('nchar', 'sqlserver', { length: 2 })).toEqual({
            kind: 'char',
            length: 2,
            national: true,
        });
    });

    it('reads varchar spellings, max and a missing length', () => {
        expect(neutral('character varying', 'postgres', { length: 9 })).toEqual(
            {
                kind: 'varchar',
                length: 9,
            }
        );
        expect(neutral('varchar2', 'oracle')).toEqual({
            kind: 'varchar',
            length: undefined,
        });
        expect(neutral('nvarchar', 'sqlserver', { length: 'max' })).toEqual({
            kind: 'varchar',
            length: 'max',
            national: true,
        });
        expect(neutral('NVARCHAR2', 'oracle', { length: 10 })).toMatchObject({
            national: true,
        });
    });

    it('reads text and blob sizes', () => {
        expect(neutral('tinytext', 'mysql')).toEqual({
            kind: 'text',
            size: 'tiny',
        });
        expect(neutral('ntext', 'sqlserver')).toEqual({
            kind: 'text',
            size: 'regular',
        });
        expect(neutral('mediumtext', 'mysql')).toEqual({
            kind: 'text',
            size: 'medium',
        });
        expect(neutral('nclob', 'oracle')).toEqual({
            kind: 'text',
            size: 'long',
        });
        expect(neutral('long', 'oracle')).toEqual({
            kind: 'text',
            size: 'long',
        });
        expect(neutral('tinyblob', 'mysql')).toEqual({
            kind: 'blob',
            size: 'tiny',
        });
        expect(neutral('mediumblob', 'mysql')).toEqual({
            kind: 'blob',
            size: 'medium',
        });
        expect(neutral('longblob', 'mysql')).toEqual({
            kind: 'blob',
            size: 'long',
        });
    });
});

describe('readNeutral: binary types', () => {
    it('reads RAW(16) filled by SYS_GUID() as a uuid', () => {
        expect(
            neutral('RAW', 'oracle', { length: 16, default: ' (SYS_GUID()) ' })
        ).toEqual({ kind: 'uuid' });
        expect(neutral('raw', 'oracle', { length: 16 })).toEqual({
            kind: 'binary',
            length: 16,
            varying: true,
        });
        expect(
            neutral('raw', 'oracle', { length: 8, default: 'sys_guid()' })
        ).toMatchObject({ kind: 'binary' });
    });

    it('reads the other binary spellings', () => {
        expect(neutral('long raw', 'oracle')).toEqual({
            kind: 'blob',
            size: 'long',
        });
        expect(read('bfile', 'oracle')).toMatchObject({
            neutral: { kind: 'blob', size: 'long' },
            approximate: true,
        });
        expect(neutral('bytea')).toEqual({ kind: 'binary', varying: true });
        expect(neutral('binary', 'mysql', { length: 4 })).toEqual({
            kind: 'binary',
            length: 4,
            varying: false,
        });
        expect(neutral('varbinary', 'sqlserver', { length: 'max' })).toEqual({
            kind: 'binary',
            length: undefined,
            varying: true,
        });
        expect(neutral('image', 'sqlserver')).toEqual({
            kind: 'blob',
            size: 'long',
        });
    });

    it('reads rowversion and SQL Server timestamp as BINARY(8)', () => {
        for (const t of ['rowversion', 'timestamp'])
            expect(read(t, 'sqlserver')).toMatchObject({
                neutral: { kind: 'binary', length: 8, varying: false },
                approximate: true,
            });
    });

    it('reads Oracle rowid and urowid as text with a note', () => {
        expect(read('urowid', 'oracle')).toEqual({
            neutral: { kind: 'varchar', length: 255 },
            note: 'urowid stored as text',
            approximate: true,
        });
    });
});

describe('readNeutral: dates and times', () => {
    it('reads an Oracle DATE as a timestamp with a note', () => {
        expect(read('DATE', 'oracle')).toEqual({
            neutral: { kind: 'datetime', zone: false },
            note: 'Oracle DATE holds a time of day: converted to a timestamp',
        });
        expect(neutral('date', 'mysql')).toEqual({ kind: 'date' });
    });

    it.each([
        ['time', { kind: 'time', zone: false }],
        ['time without time zone', { kind: 'time', zone: false }],
        ['timetz', { kind: 'time', zone: true }],
        ['time with time zone', { kind: 'time', zone: true }],
        ['timestamp', { kind: 'datetime', zone: false }],
        ['datetime2', { kind: 'datetime', zone: false }],
        ['smalldatetime', { kind: 'datetime', zone: false }],
        ['timestamp without time zone', { kind: 'datetime', zone: false }],
        ['timestamptz', { kind: 'datetime', zone: true }],
        ['timestamp with local time zone', { kind: 'datetime', zone: true }],
        ['datetimeoffset', { kind: 'datetime', zone: true }],
    ])('%s', (t, expected) => {
        expect(neutral(t)).toEqual(expected);
    });
});

describe('readNeutral: other types', () => {
    it('reads json by source and jsonb', () => {
        expect(neutral('json', 'postgres')).toEqual({
            kind: 'json',
            binary: false,
        });
        expect(neutral('json', 'mysql')).toEqual({
            kind: 'json',
            binary: true,
        });
        expect(neutral('jsonb')).toEqual({ kind: 'json', binary: true });
    });

    it('reads uuid, xml, enum and spatial types', () => {
        expect(neutral('uniqueidentifier', 'sqlserver')).toEqual({
            kind: 'uuid',
        });
        expect(neutral('xmltype', 'oracle')).toEqual({ kind: 'xml' });
        expect(neutral('xml')).toEqual({ kind: 'xml' });
        expect(neutral('enum', 'mysql')).toEqual({ kind: 'enum' });
        expect(neutral('geometry', 'mysql')).toEqual({
            kind: 'geo',
            geography: false,
        });
        expect(neutral('geography', 'sqlserver')).toEqual({
            kind: 'geo',
            geography: true,
        });
    });

    it('reads PostgreSQL object identifiers as numbers with a note', () => {
        for (const t of [
            'oid',
            'regclass',
            'regproc',
            'regtype',
            'regnamespace',
            'regrole',
        ])
            expect(read(t)).toEqual({
                neutral: { kind: 'int', bits: 64 },
                note: `${t} converted to a number`,
                approximate: true,
            });
    });

    it('stores network, range and search types as text with a note', () => {
        expect(read('inet')).toEqual({
            neutral: { kind: 'varchar', length: 255 },
            note: 'inet stored as text',
            approximate: true,
        });
        expect(read('INTERVAL DAY TO SECOND', 'oracle').note).toBe(
            'interval day to second stored as text'
        );
    });

    it('stores an unknown type as text, naming it as written', () => {
        expect(read('Weird_Type')).toEqual({
            neutral: {
                kind: 'other',
                note: 'unknown type "Weird_Type"; stored as text',
            },
            note: 'unknown type "Weird_Type"; stored as text',
            approximate: true,
        });
    });
});

describe('readNeutral: arrays and user types', () => {
    it('wraps an array column, from the flag or a [] suffix', () => {
        expect(read('int[]')).toEqual({
            neutral: {
                kind: 'array',
                of: { kind: 'int', bits: 32, unsigned: false },
            },
            approximate: true,
        });
        expect(read('text', 'postgres', { isArray: true }).neutral).toEqual({
            kind: 'array',
            of: { kind: 'text', size: 'regular' },
        });
    });

    it('keeps the inner note of an array of an unknown type', () => {
        expect(read('mystery[]').note).toBe(
            'unknown type "mystery[]"; stored as text'
        );
    });

    const userTypes: UserType[] = [
        {
            id: 'u1',
            name: 'mood',
            kind: 'enum',
            values: ['calm', 'busy'],
        } as UserType,
        { id: 'u2', name: 'flag', kind: 'enum' } as UserType,
        { id: 'u3', name: 'pair', kind: 'composite' } as UserType,
        { id: 'u4', name: 'int', kind: 'alias' } as UserType,
    ];

    it('reads an enum user type with its values, or none', () => {
        expect(read('mood', 'postgres', {}, userTypes).neutral).toEqual({
            kind: 'enum',
            values: ['calm', 'busy'],
        });
        expect(read('flag', 'postgres', {}, userTypes).neutral).toEqual({
            kind: 'enum',
            values: [],
        });
    });

    it('stores a composite user type as JSON', () => {
        expect(read('pair', 'postgres', {}, userTypes)).toEqual({
            neutral: { kind: 'json', binary: true },
            note: 'composite type pair stored as JSON',
            approximate: true,
        });
    });

    it('reads an array of an enum user type', () => {
        expect(
            read('mood', 'postgres', { isArray: true }, userTypes).neutral
        ).toEqual({
            kind: 'array',
            of: { kind: 'enum', values: ['calm', 'busy'] },
        });
    });

    it('does not take an alias type for the base type it shadows', () => {
        expect(read('int', 'postgres', {}, userTypes).neutral).toEqual({
            kind: 'int',
            bits: 32,
            unsigned: false,
        });
    });
});
