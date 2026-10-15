import { describe, expect, it } from 'vitest';
import type { Canon, TargetDialect } from '../canonical';
import { parseDefault, renderDefault } from '../defaults';
import { renderType } from '../render-type';

describe('reading a column default', () => {
    it.each([
        ['now()', { kind: 'now' }],
        ['CURRENT_TIMESTAMP', { kind: 'now' }],
        ['current_timestamp(6)', { kind: 'now' }],
        ['(getdate())', { kind: 'now' }],
        ['(sysdatetimeoffset())', { kind: 'now' }],
        ["(datetime('now'))", { kind: 'now' }],
        ['CURRENT_DATE', { kind: 'currentDate' }],
        ['(curdate())', { kind: 'currentDate' }],
        ['CURRENT_TIME', { kind: 'currentTime' }],
        ['gen_random_uuid()', { kind: 'uuid' }],
        ['(uuid())', { kind: 'uuid' }],
        ['(newid())', { kind: 'uuid' }],
        ['NULL', { kind: 'null' }],
        ['((NULL))', { kind: 'null' }],
        ['true', { kind: 'bool', value: true }],
        ['FALSE', { kind: 'bool', value: false }],
        ["b'1'", { kind: 'bool', value: true }],
        ['0', { kind: 'number', text: '0' }],
        ['((0))', { kind: 'number', text: '0' }],
        ['-1.5', { kind: 'number', text: '-1.5' }],
        ["'new'", { kind: 'string', text: 'new' }],
        ["'new'::character varying", { kind: 'string', text: 'new' }],
        ["(N'new')", { kind: 'string', text: 'new' }],
        ["('it''s')", { kind: 'string', text: "it's" }],
        ["'a::b'", { kind: 'string', text: 'a::b' }],
        ["nextval('seq'::regclass)", { kind: 'auto' }],
        ['IDENTITY(1,1)', { kind: 'auto' }],
        ['jsonb_build_object()', { kind: 'string', text: '{}' }],
        ['json_build_array()', { kind: 'string', text: '[]' }],
        ["ARRAY['a', 'b']", { kind: 'array', json: '["a","b"]' }],
        ['ARRAY[1, 2]', { kind: 'array', json: '[1,2]' }],
        ['lower(name)', { kind: 'raw', text: 'lower(name)' }],
    ] as const)('%s', (input, expected) => {
        expect(parseDefault(input)).toEqual(expected);
    });

    it('does not take a string that spells a function for the function', () => {
        expect(parseDefault("'now()'")).toEqual({
            kind: 'string',
            text: 'now()',
        });
        expect(parseDefault("'identity'")).toEqual({
            kind: 'string',
            text: 'identity',
        });
    });
});

const render = (
    raw: string,
    canon: Canon,
    target: TargetDialect
): { sql?: string; note?: string } => {
    const type = renderType(target, canon, { isKey: false });
    return renderDefault(parseDefault(raw), canon, type, target);
};

const dt: Canon = { kind: 'datetime', tz: false };
const dtz: Canon = { kind: 'datetime', tz: true };
const vc: Canon = { kind: 'varchar', length: 20, national: true };
const bool: Canon = { kind: 'bool' };
const int: Canon = { kind: 'int', bits: 32 };

describe('writing a column default for each database', () => {
    it('writes the current time the way each database does', () => {
        expect(render('now()', dt, 'postgresql').sql).toBe('CURRENT_TIMESTAMP');
        expect(render('now()', dt, 'mysql').sql).toBe('CURRENT_TIMESTAMP');
        expect(render('now()', dt, 'sqlserver').sql).toBe('GETDATE()');
        expect(render('now()', dtz, 'sqlserver').sql).toBe(
            'SYSDATETIMEOFFSET()'
        );
        expect(render('now()', dt, 'sqlite').sql).toBe('CURRENT_TIMESTAMP');
    });

    it('gives a date column the date and a time column the time, whatever was written', () => {
        const date: Canon = { kind: 'date' };
        const time: Canon = { kind: 'time', tz: false };
        expect(render('now()', date, 'postgresql').sql).toBe('CURRENT_DATE');
        expect(render('now()', date, 'mysql').sql).toBe('(CURRENT_DATE)');
        expect(render('CURRENT_DATE', date, 'sqlserver').sql).toBe(
            'CAST(GETDATE() AS DATE)'
        );
        expect(render('now()', time, 'sqlite').sql).toBe('CURRENT_TIME');
        expect(render('curtime()', time, 'mysql').sql).toBe('(CURRENT_TIME)');
    });

    it('refuses the current time as the default of a column that is not a date', () => {
        const dropped = render('now()', vc, 'postgresql');
        expect(dropped.sql).toBeUndefined();
        expect(dropped.note).toMatch(
            /cannot be the default of a varchar column/
        );
    });

    it('generates a UUID in each database', () => {
        const uuid: Canon = { kind: 'uuid' };
        expect(render('(newid())', uuid, 'postgresql').sql).toBe(
            'gen_random_uuid()'
        );
        expect(render('gen_random_uuid()', uuid, 'mysql').sql).toBe('(UUID())');
        expect(render('uuid()', uuid, 'sqlserver').sql).toBe('NEWID()');
        expect(render('uuid()', vc, 'sqlserver').sql).toBe(
            'CONVERT(VARCHAR(36), NEWID())'
        );
        expect(render('uuid()', uuid, 'sqlite').sql).toMatch(/randomblob/);
        expect(render('uuid()', int, 'mysql').note).toMatch(/UUID/);
    });

    it('writes booleans for the column they go in', () => {
        expect(render('true', bool, 'postgresql').sql).toBe('true');
        expect(render('true', bool, 'mysql').sql).toBe('1');
        expect(render('false', bool, 'sqlserver').sql).toBe('0');
        // a number becomes a boolean in a boolean column, in either direction
        expect(render('1', bool, 'postgresql').sql).toBe('true');
        expect(render('((0))', bool, 'postgresql').sql).toBe('false');
        expect(render("'t'", bool, 'sqlite').sql).toBe('1');
        expect(render("'maybe'", bool, 'postgresql').note).toMatch(
            /not a boolean/
        );
        expect(render('true', int, 'postgresql').sql).toBe('1');
    });

    it('quotes text and leaves numbers alone', () => {
        expect(render("'new'::character varying", vc, 'mysql').sql).toBe(
            "'new'"
        );
        expect(render("(N'new')", vc, 'postgresql').sql).toBe("'new'");
        expect(render("'it''s'", vc, 'sqlite').sql).toBe("'it''s'");
        expect(
            render("(N'x')", { ...vc, national: true }, 'sqlserver').sql
        ).toBe("N'x'");
        expect(render("'x'", { ...vc, national: false }, 'sqlserver').sql).toBe(
            "'x'"
        );
        expect(render('0', int, 'mysql').sql).toBe('0');
        expect(render('((0))', int, 'postgresql').sql).toBe('0');
        // a number as the default of a text column is text
        expect(render('0', vc, 'postgresql').sql).toBe("'0'");
        // a number that arrives as text goes into a number column as a number
        expect(
            render(
                "'0.00'",
                { kind: 'decimal', precision: 5, scale: 2 },
                'mysql'
            ).sql
        ).toBe('0.00');
        expect(render("'abc'", int, 'mysql').note).toMatch(/not a number/);
    });

    it('doubles a backslash for MySQL, which treats it as an escape', () => {
        expect(render("'a\\b'", vc, 'mysql').sql).toBe("'a\\\\b'");
        expect(render("'a\\b'", vc, 'postgresql').sql).toBe("'a\\b'");
    });

    it('puts a literal in parentheses where MySQL only takes expressions', () => {
        const text: Canon = { kind: 'text', size: 'regular', national: true };
        expect(render("'x'", text, 'mysql').sql).toBe("('x')");
        expect(
            render("'{}'", { kind: 'json', binary: true }, 'mysql').sql
        ).toBe("('{}')");
        expect(render("'x'", text, 'postgresql').sql).toBe("'x'");
        expect(render("'x'", vc, 'mysql').sql).toBe("'x'");
    });

    it('writes a list default as a JSON array', () => {
        const arr: Canon = {
            kind: 'array',
            of: { kind: 'text', size: 'long', national: true },
        };
        expect(render("'{}'::text[]", arr, 'mysql').sql).toBe("('[]')");
        expect(render('\'{a,"b c"}\'', arr, 'sqlite').sql).toBe(
            '\'["a","b c"]\''
        );
        expect(render("ARRAY['x']", arr, 'sqlserver').sql).toBe('N\'["x"]\'');
        const nums: Canon = { kind: 'array', of: { kind: 'int', bits: 32 } };
        expect(render("'{1,2}'", nums, 'mysql').sql).toBe("('[1,2]')");
        expect(
            render(
                'jsonb_build_object()',
                { kind: 'json', binary: true },
                'mysql'
            ).sql
        ).toBe("('{}')");
    });

    it('drops a default it does not understand, and says which one', () => {
        const dropped = render('lower(name)', vc, 'postgresql');
        expect(dropped.sql).toBeUndefined();
        expect(dropped.note).toBe(
            'the default expression lower(name) was not converted'
        );
    });

    it('does not give a default to a column that numbers itself', () => {
        expect(render("nextval('seq'::regclass)", int, 'mysql')).toEqual({});
    });
});
