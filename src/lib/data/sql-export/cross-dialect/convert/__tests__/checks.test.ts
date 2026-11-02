import { describe, expect, it } from 'vitest';
import type { Canon, SourceDialect, TargetDialect } from '../canonical';
import { convertCheck } from '../checks';

const columns = new Map<string, Canon>([
    ['qty', { kind: 'int', bits: 32 }],
    ['status', { kind: 'varchar', length: 20, national: true }],
    ['sku', { kind: 'varchar', length: 40, national: true }],
    ['active', { kind: 'bool' }],
    ['price', { kind: 'decimal', precision: 10, scale: 2 }],
]);

const convert = (
    expression: string,
    source: SourceDialect,
    target: TargetDialect
) => convertCheck(expression, source, target, columns);

const ok = (r: ReturnType<typeof convert>) => {
    if (!r.ok) throw new Error(`expected a conversion, got: ${r.reason}`);
    return r.sql;
};
const why = (r: ReturnType<typeof convert>) => {
    if (r.ok) throw new Error(`expected a refusal, got: ${r.sql}`);
    return r.reason;
};

describe('rewriting a CHECK for another database', () => {
    it('requotes the column names for the target', () => {
        expect(ok(convert('((qty > 0))', 'postgresql', 'mysql'))).toBe(
            '`qty` > 0'
        );
        expect(ok(convert('(`qty` > 0)', 'mysql', 'postgresql'))).toBe(
            '"qty" > 0'
        );
        expect(ok(convert('([qty]>(0))', 'sqlserver', 'sqlite'))).toBe(
            '"qty" > (0)'
        );
        expect(ok(convert('"qty" > 0', 'postgresql', 'sqlserver'))).toBe(
            '[qty] > 0'
        );
    });

    it('reads a name in any quoting, and any case', () => {
        expect(ok(convert('QTY > 0', 'sqlite', 'postgresql'))).toBe(
            '"QTY" > 0'
        );
        expect(ok(convert('[Qty] > 0', 'sqlserver', 'mysql'))).toBe(
            '`Qty` > 0'
        );
    });

    it('keeps comparisons, lists, ranges, patterns and nulls', () => {
        expect(ok(convert("status IN ('a', 'b')", 'mysql', 'postgresql'))).toBe(
            `"status" IN ('a', 'b')`
        );
        expect(ok(convert('qty BETWEEN 1 AND 10', 'sqlite', 'mysql'))).toBe(
            '`qty` BETWEEN 1 AND 10'
        );
        expect(
            ok(
                convert(
                    "sku like 'A%' or sku is null",
                    'postgresql',
                    'sqlserver'
                )
            )
        ).toBe("[sku] LIKE 'A%' OR [sku] IS NULL");
        expect(
            ok(convert('NOT (qty = 0) AND qty != 5', 'mysql', 'sqlite'))
        ).toBe('NOT ("qty" = 0) AND "qty" <> 5');
        expect(
            ok(convert('price >= 0.5 AND qty <= -1', 'sqlite', 'postgresql'))
        ).toBe('"price" >= 0.5 AND "qty" <= -1');
    });

    it('writes true and false as 1 and 0 for SQL Server, which has no such words', () => {
        expect(ok(convert('active = true', 'postgresql', 'sqlserver'))).toBe(
            '[active] = 1'
        );
        expect(ok(convert('active = false', 'postgresql', 'mysql'))).toBe(
            '`active` = FALSE'
        );
    });

    it('keeps a string as it is', () => {
        expect(ok(convert("status <> 'it''s'", 'sqlite', 'postgresql'))).toBe(
            `"status" <> 'it''s'`
        );
    });

    describe('functions with an equivalent', () => {
        it('translates the length of a string', () => {
            expect(
                ok(convert('char_length(sku) > 2', 'postgresql', 'sqlserver'))
            ).toBe('LEN([sku]) > 2');
            expect(ok(convert('len(sku) > 2', 'sqlserver', 'postgresql'))).toBe(
                'CHAR_LENGTH("sku") > 2'
            );
            expect(ok(convert('LENGTH(sku) > 2', 'sqlite', 'mysql'))).toBe(
                'CHAR_LENGTH(`sku`) > 2'
            );
            expect(
                ok(convert('character_length(sku) > 2', 'mysql', 'sqlite'))
            ).toBe('LENGTH("sku") > 2');
        });

        it('does not read MySQL LENGTH as a character count: it counts bytes', () => {
            expect(
                why(convert('length(sku) > 2', 'mysql', 'postgresql'))
            ).toMatch(/length\(\)/);
        });

        it('keeps the functions that mean the same everywhere', () => {
            expect(
                ok(
                    convert(
                        'lower(status) = upper(status)',
                        'postgresql',
                        'mysql'
                    )
                )
            ).toBe('LOWER(`status`) = UPPER(`status`)');
            expect(
                ok(
                    convert(
                        'abs(qty) > coalesce(qty, 0)',
                        'sqlite',
                        'sqlserver'
                    )
                )
            ).toBe('ABS([qty]) > COALESCE([qty], 0)');
        });
    });

    describe('what it will not guess at', () => {
        it.each([
            ['to_char(qty) = 1', /to_char\(\)/],
            ["status ~ '^a'", /operator ~/],
            ['qty::text = 1', /operator ::/],
            ["status = 'a' || 'b'", /operator \|/],
            ['qty = ANY (ARRAY[1, 2])', /ANY/],
            ['CASE WHEN qty > 1 THEN true END', /CASE, which is not a column/],
            ['missing > 1', /missing, which is not a column/],
            [
                'qty > current_timestamp',
                /current_timestamp, which is not a column/,
            ],
        ])('%s', (expression, reason) => {
            expect(why(convert(expression, 'postgresql', 'mysql'))).toMatch(
                reason
            );
        });

        it('will not compare a boolean with a number in PostgreSQL', () => {
            expect(
                why(convert('active = 1', 'sqlserver', 'postgresql'))
            ).toMatch(/boolean column compared with a number/);
            // but is fine elsewhere
            expect(ok(convert('active = 1', 'sqlserver', 'mysql'))).toBe(
                '`active` = 1'
            );
        });

        it('refuses a string it cannot read', () => {
            expect(
                why(convert("status = 'open", 'postgresql', 'mysql'))
            ).toMatch(/unterminated/);
            expect(
                why(convert("status = 'a\\'b'", 'mysql', 'postgresql'))
            ).toMatch(/backslash/);
        });
    });

    it('accepts a CHECK written out in full', () => {
        expect(ok(convert('CHECK (qty > 0)', 'mysql', 'postgresql'))).toBe(
            '"qty" > 0'
        );
    });
});
