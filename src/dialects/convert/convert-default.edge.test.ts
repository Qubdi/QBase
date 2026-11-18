import { describe, expect, it } from 'vitest';
import { convertDefault } from './convert-default';
import type { Flavour, Neutral } from './contract';

const FLAVOURS: Flavour[] = [
    'postgres',
    'mysql',
    'sqlserver',
    'sqlite',
    'oracle',
];

const INT: Neutral = { kind: 'int', bits: 32 };
const BOOL: Neutral = { kind: 'bool' };
const VARCHAR: Neutral = { kind: 'varchar', length: 20 };
const NVARCHAR: Neutral = { kind: 'varchar', length: 20, national: true };
const TEXT: Neutral = { kind: 'text', size: 'regular' };
const DATE: Neutral = { kind: 'date' };
const TIME: Neutral = { kind: 'time', zone: false };
const TS: Neutral = { kind: 'datetime', zone: false };
const TSZ: Neutral = { kind: 'datetime', zone: true };
const UUID: Neutral = { kind: 'uuid' };
const JSON_: Neutral = { kind: 'json', binary: true };
const INT_ARRAY: Neutral = { kind: 'array', of: INT };

/** The default text for each flavour, in FLAVOURS order. */
const row = (raw: string, n: Neutral) =>
    FLAVOURS.map((f) => convertDefault(raw, n, f).text);

describe('convertDefault: markers, NULL and booleans', () => {
    it('drops a numbering marker without a note', () => {
        expect(
            convertDefault("nextval('t_id_seq'::regclass)", INT, 'mysql')
        ).toEqual({});
        expect(convertDefault('(IDENTITY)', INT, 'postgres')).toEqual({});
    });

    it('keeps a quoted value that only looks like a marker', () => {
        expect(convertDefault("'identity'", VARCHAR, 'postgres')).toEqual({
            text: "'identity'",
        });
    });

    it('writes NULL in any spelling and through parentheses', () => {
        expect(row('((null))', INT)).toEqual(Array(5).fill('NULL'));
        expect(
            convertDefault('NULL::character varying', VARCHAR, 'sqlserver')
        ).toEqual({
            text: 'NULL',
        });
    });

    it('writes a boolean as true/false or 1/0', () => {
        expect(row('TRUE', BOOL)).toEqual(['true', '1', '1', '1', '1']);
        expect(row('(false)', BOOL)).toEqual(['false', '0', '0', '0', '0']);
        expect(convertDefault('true', INT, 'postgres')).toEqual({ text: '1' });
        expect(convertDefault('false', VARCHAR, 'postgres')).toEqual({
            text: '0',
        });
    });

    it('drops a boolean on a column that cannot hold one', () => {
        expect(convertDefault(' true ', DATE, 'mysql')).toEqual({
            note: 'the default expression true was not converted (a boolean on a column that is not boolean)',
        });
    });
});

describe('convertDefault: numbers', () => {
    it('writes numbers bare, quoted for text, wrapped for MySQL blobs', () => {
        expect(row('((-42.5))', INT)).toEqual(Array(5).fill('-42.5'));
        expect(convertDefault('7', VARCHAR, 'sqlserver')).toEqual({
            text: "'7'",
        });
        expect(convertDefault('7', TEXT, 'mysql')).toEqual({ text: "('7')" });
        expect(convertDefault('7', JSON_, 'mysql')).toEqual({ text: '(7)' });
        expect(convertDefault('7', JSON_, 'postgres')).toEqual({ text: '7' });
    });

    it('takes a number out of a cast', () => {
        expect(convertDefault('0::smallint', INT, 'mysql')).toEqual({
            text: '0',
        });
        expect(
            convertDefault('CAST(5 AS numeric(10, 2))', INT, 'sqlite')
        ).toEqual({
            text: '5',
        });
    });

    it('drops a number on a date or time column', () => {
        for (const n of [DATE, TIME, TS])
            expect(convertDefault('0', n, 'postgres').note).toMatch(
                /a number on a date column/
            );
    });

    it('writes 0 and 1 on a PostgreSQL boolean as false and true, drops others', () => {
        expect(convertDefault('((1))', BOOL, 'postgres')).toEqual({
            text: 'true',
        });
        expect(convertDefault('0', BOOL, 'postgres')).toEqual({
            text: 'false',
        });
        expect(convertDefault('2', BOOL, 'postgres').note).toMatch(
            /not 0 or 1 on a boolean column/
        );
        expect(convertDefault('2', BOOL, 'mysql')).toEqual({ text: '2' });
    });

    it('does not read an exponent as a number', () => {
        expect(convertDefault('1e5', INT, 'postgres').note).toMatch(
            /not understood/
        );
    });
});

describe('convertDefault: strings', () => {
    it('keeps doubled quotes and adds N for SQL Server national columns', () => {
        expect(row("'it''s'", VARCHAR)).toEqual([
            "'it''s'",
            "'it''s'",
            "'it''s'",
            "'it''s'",
            "'it''s'",
        ]);
        expect(convertDefault("N'x'", NVARCHAR, 'sqlserver')).toEqual({
            text: "N'x'",
        });
        expect(convertDefault("N'x'", NVARCHAR, 'postgres')).toEqual({
            text: "'x'",
        });
    });

    it('doubles backslashes only for MySQL', () => {
        expect(convertDefault("'C:\\dir'", VARCHAR, 'mysql')).toEqual({
            text: "'C:\\\\dir'",
        });
        expect(convertDefault("'C:\\dir'", VARCHAR, 'postgres')).toEqual({
            text: "'C:\\dir'",
        });
    });

    it('takes a string out of a PostgreSQL cast and a CAST', () => {
        expect(convertDefault("'calm'::public.mood", VARCHAR, 'mysql')).toEqual(
            { text: "'calm'" }
        );
        expect(
            convertDefault("('x'::character varying(10))", VARCHAR, 'sqlserver')
        ).toEqual({ text: "'x'" });
        expect(
            convertDefault("CAST('2020-01-01' AS date)", DATE, 'oracle')
        ).toEqual({ text: "'2020-01-01'" });
    });

    // BUG: convert-default.ts:193-196 splits a PostgreSQL array literal with
    // a plain split(',') that ignores double quotes, so the one element
    // "a,b" becomes two elements a and b.
    it.fails('keeps a quoted array element holding a comma', () => {
        expect(convertDefault(`'{"a,b",c}'`, INT_ARRAY, 'sqlserver')).toEqual({
            text: `'["a,b", "c"]'`,
        });
    });

    // BUG: convert-default.ts:196 strips the outer double quotes of an array
    // element but does not undo its backslash escapes, so {"a\\b"} (the
    // one-backslash text a\b) is written as JSON "a\\\\b" (two backslashes)
    // and {"say \"hi\""} keeps its backslashes.
    it.fails('undoes backslash escapes inside a quoted array element', () => {
        expect(convertDefault(`'{"a\\\\b"}'`, INT_ARRAY, 'sqlserver')).toEqual({
            text: `'["a\\\\b"]'`,
        });
    });

    it('keeps a multi-line string', () => {
        expect(convertDefault("'a\nb'", TEXT, 'postgres')).toEqual({
            text: "'a\nb'",
        });
    });

    it('writes an array literal as a JSON text where there are no arrays', () => {
        expect(
            convertDefault('\'{1, 2,,"x y"}\'', INT_ARRAY, 'sqlite')
        ).toEqual({
            text: `'[1, 2, "x y"]'`,
        });
        expect(convertDefault("'{a,b}'", INT_ARRAY, 'mysql')).toEqual({
            text: `('["a", "b"]')`,
        });
        expect(convertDefault("'{1,2}'", INT_ARRAY, 'postgres')).toEqual({
            text: "'{1,2}'",
        });
    });
});

describe('convertDefault: date and time functions', () => {
    it('writes now() in each dialect', () => {
        expect(row('now()', TS)).toEqual([
            'CURRENT_TIMESTAMP',
            'CURRENT_TIMESTAMP',
            'GETDATE()',
            'CURRENT_TIMESTAMP',
            'CURRENT_TIMESTAMP',
        ]);
        expect(convertDefault('SYSDATETIMEOFFSET()', TSZ, 'sqlserver')).toEqual(
            {
                text: 'SYSDATETIMEOFFSET()',
            }
        );
    });

    it.each([
        'now()',
        'CURRENT_TIMESTAMP',
        'current_timestamp(3)',
        'localtimestamp',
        'getdate()',
        'sysdatetime()',
        'SYSDATE',
        'systimestamp',
        'utc_timestamp()',
        "datetime( 'now' )",
        '(getdate())',
    ])('reads %s as the current time', (raw) => {
        expect(convertDefault(raw, TS, 'postgres')).toEqual({
            text: 'CURRENT_TIMESTAMP',
        });
    });

    it('drops a date function on a number column', () => {
        for (const n of [
            INT,
            { kind: 'decimal' } as Neutral,
            { kind: 'float', bits: 64 } as Neutral,
            BOOL,
        ])
            expect(convertDefault('now()', n, 'mysql').note).toMatch(
                /a date function on a number column/
            );
    });

    it('writes the current date and time', () => {
        expect(row('CURRENT_DATE', DATE)).toEqual([
            'CURRENT_DATE',
            '(CURRENT_DATE)',
            'CAST(GETDATE() AS DATE)',
            'CURRENT_DATE',
            'CURRENT_DATE',
        ]);
        expect(convertDefault('curdate()', DATE, 'postgres').text).toBe(
            'CURRENT_DATE'
        );
        expect(row('current_time(0)', TIME)).toEqual([
            'CURRENT_TIME',
            '(CURRENT_TIME)',
            'CAST(GETDATE() AS TIME)',
            'CURRENT_TIME',
            'CURRENT_TIMESTAMP',
        ]);
        expect(convertDefault('CURTIME()', TIME, 'sqlite').text).toBe(
            'CURRENT_TIME'
        );
    });
});

describe('convertDefault: uuid functions', () => {
    it('writes a uuid generator in each dialect', () => {
        const r = row('gen_random_uuid()', UUID);
        expect(r.slice(0, 3)).toEqual([
            'gen_random_uuid()',
            '(UUID())',
            'NEWID()',
        ]);
        expect(r[3]).toMatch(/^\(lower\(hex\(randomblob\(4\)\)\)/);
        expect(r[4]).toBe('SYS_GUID()');
    });

    it('writes a text uuid for a textual column', () => {
        expect(convertDefault('newid()', VARCHAR, 'sqlserver')).toEqual({
            text: 'CONVERT(VARCHAR(36), NEWID())',
        });
        expect(convertDefault('NEWSEQUENTIALID()', VARCHAR, 'oracle')).toEqual({
            text: 'RAWTOHEX(SYS_GUID())',
        });
    });

    it.each([
        'uuid_generate_v4()',
        'uuid()',
        'sys_guid()',
        'lower(hex(randomblob(16)))',
    ])('reads %s as a uuid generator', (raw) => {
        expect(convertDefault(raw, UUID, 'postgres')).toEqual({
            text: 'gen_random_uuid()',
        });
    });

    it('drops a uuid function on a number column', () => {
        expect(convertDefault('uuid()', INT, 'postgres').note).toMatch(
            /a uuid function on a column that is not a uuid/
        );
    });
});

describe('convertDefault: ARRAY[...] lists', () => {
    it('writes a list on a JSON column as JSON', () => {
        expect(convertDefault('ARRAY[1, -2.5]', JSON_, 'mysql')).toEqual({
            text: "('[1, -2.5]')",
        });
    });

    it('drops a list on a column that is not a list', () => {
        expect(convertDefault("ARRAY['a']", VARCHAR, 'sqlserver').note).toMatch(
            /a list on a column that is not a list/
        );
    });

    it('skips empty items and reads an empty list', () => {
        expect(convertDefault('ARRAY[1,,2]', INT_ARRAY, 'sqlite')).toEqual({
            text: "'[1, 2]'",
        });
        expect(
            convertDefault('ARRAY[]::integer[]', INT_ARRAY, 'postgres')
        ).toEqual({
            text: "'{}'",
        });
    });

    it('drops a list holding an expression or an open quote', () => {
        expect(
            convertDefault('ARRAY[now()]', INT_ARRAY, 'sqlite').note
        ).toMatch(/not understood/);
        expect(convertDefault("ARRAY['a]", INT_ARRAY, 'sqlite').note).toMatch(
            /not understood/
        );
        expect(
            convertDefault('ARRAY[1] || ARRAY[2]', INT_ARRAY, 'sqlite').note
        ).toMatch(/not understood/);
    });

    it('keeps an item that holds a comma, quotes and spaces', () => {
        expect(
            convertDefault(
                "ARRAY['a,b', 'it''s', 'x y']",
                INT_ARRAY,
                'postgres'
            )
        ).toEqual({ text: `'{"a,b","it''s","x y"}'` });
    });
});

describe('convertDefault: expressions it does not understand', () => {
    it('drops them with the raw text in the note', () => {
        expect(convertDefault('  (a + b)  ', INT, 'sqlserver')).toEqual({
            note: 'the default expression (a + b) was not converted (not understood)',
        });
    });

    it('does not unwrap parentheses that do not wrap the whole text', () => {
        expect(convertDefault('(1) + (2)', INT, 'postgres').note).toMatch(
            /not understood/
        );
    });

    it('does not take a parenthesis inside a string as a closing one', () => {
        expect(convertDefault("(')')", VARCHAR, 'postgres')).toEqual({
            text: "')'",
        });
    });
});
