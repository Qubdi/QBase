import { describe, expect, it } from 'vitest';
import { DBCustomTypeKind } from '@/lib/domain/db-custom-type';
import { parseSourceType, type SourceDialect } from '../canonical';
import { field } from './builders';

const parse = (
    source: SourceDialect,
    type: string,
    over: Parameters<typeof field>[2] = {}
) => parseSourceType(field('c', type, over), source);

describe('reading a column type into the neutral form', () => {
    describe('integers', () => {
        it.each([
            ['mysql', 'tinyint', 8, undefined],
            ['mysql', 'smallint', 16, undefined],
            ['mysql', 'mediumint', 24, undefined],
            ['mysql', 'int', 32, undefined],
            ['mysql', 'bigint', 64, undefined],
            ['postgresql', 'integer', 32, undefined],
            ['postgresql', 'int8', 64, undefined],
            ['sqlserver', 'int', 32, undefined],
            // a SQLite INTEGER holds up to 64 bits, an INT is the usual 32
            ['sqlite', 'integer', 64, undefined],
            ['sqlite', 'int', 32, undefined],
            // SQL Server's tinyint is 0..255
            ['sqlserver', 'tinyint', 8, true],
        ] as const)('%s %s', (source, type, bits, unsigned) => {
            const { canon } = parse(source, type);
            expect(canon).toMatchObject({ kind: 'int', bits });
            expect(!!(canon as { unsigned?: boolean }).unsigned).toBe(
                !!unsigned
            );
        });

        it('reads unsigned from the type name', () => {
            expect(parse('mysql', 'int unsigned').canon).toMatchObject({
                kind: 'int',
                bits: 32,
                unsigned: true,
            });
        });

        it('knows the serial types number themselves', () => {
            expect(parse('postgresql', 'serial')).toMatchObject({
                canon: { kind: 'int', bits: 32 },
                auto: true,
            });
            expect(parse('postgresql', 'bigserial')).toMatchObject({
                canon: { kind: 'int', bits: 64 },
                auto: true,
            });
            expect(parse('postgresql', 'smallserial').canon).toMatchObject({
                bits: 16,
            });
        });
    });

    describe('numbers', () => {
        it('keeps precision and scale, from the field or from the name', () => {
            expect(
                parse('mysql', 'decimal', { precision: 10, scale: 2 }).canon
            ).toEqual({ kind: 'decimal', precision: 10, scale: 2 });
            expect(parse('postgresql', 'numeric(8,3)').canon).toEqual({
                kind: 'decimal',
                precision: 8,
                scale: 3,
            });
            expect(parse('sqlite', 'numeric').canon).toEqual({
                kind: 'decimal',
                precision: undefined,
                scale: undefined,
            });
        });

        it('turns money into an exact decimal, and says so', () => {
            const sqlServer = parse('sqlserver', 'money');
            expect(sqlServer.canon).toEqual({
                kind: 'decimal',
                precision: 19,
                scale: 4,
            });
            expect(sqlServer.note).toMatch(/money/);
            expect(parse('sqlserver', 'smallmoney').canon).toMatchObject({
                precision: 10,
                scale: 4,
            });
        });

        it('knows how wide each database makes a float', () => {
            // MySQL: FLOAT is single, DOUBLE double. Elsewhere FLOAT is double
            expect(parse('mysql', 'float').canon).toEqual({
                kind: 'float',
                bits: 32,
            });
            expect(parse('sqlserver', 'float').canon).toEqual({
                kind: 'float',
                bits: 64,
            });
            expect(parse('postgresql', 'real').canon).toEqual({
                kind: 'float',
                bits: 32,
            });
            expect(parse('postgresql', 'double precision').canon).toEqual({
                kind: 'float',
                bits: 64,
            });
            expect(parse('sqlite', 'real').canon).toEqual({
                kind: 'float',
                bits: 64,
            });
            expect(parse('sqlserver', 'float(24)').canon).toEqual({
                kind: 'float',
                bits: 32,
            });
        });
    });

    describe('text', () => {
        it('tells national from plain text, which only SQL Server does', () => {
            expect(
                parse('sqlserver', 'varchar', { characterMaximumLength: '50' })
                    .canon
            ).toEqual({
                kind: 'varchar',
                length: 50,
                national: false,
            });
            expect(
                parse('sqlserver', 'nvarchar', { characterMaximumLength: '50' })
                    .canon
            ).toMatchObject({ national: true });
            expect(
                parse('postgresql', 'varchar', { characterMaximumLength: '50' })
                    .canon
            ).toMatchObject({ national: true });
        });

        it('reads -1 and max as unlimited', () => {
            for (const len of ['-1', 'max', 'MAX']) {
                expect(
                    parse('sqlserver', 'nvarchar', {
                        characterMaximumLength: len,
                    }).canon
                ).toMatchObject({
                    kind: 'varchar',
                    length: 'max',
                });
            }
        });

        it('knows how big each text type is', () => {
            expect(parse('mysql', 'tinytext').canon).toMatchObject({
                size: 'tiny',
            });
            expect(parse('mysql', 'text').canon).toMatchObject({
                size: 'regular',
            });
            expect(parse('mysql', 'mediumtext').canon).toMatchObject({
                size: 'medium',
            });
            expect(parse('mysql', 'longtext').canon).toMatchObject({
                size: 'long',
            });
            // PostgreSQL and SQLite text is unlimited, MySQL's is 64 KB
            expect(parse('postgresql', 'text').canon).toMatchObject({
                size: 'long',
            });
            expect(parse('sqlite', 'text').canon).toMatchObject({
                size: 'long',
            });
            expect(parse('sqlserver', 'text').canon).toMatchObject({
                size: 'long',
                national: false,
            });
            expect(parse('sqlserver', 'ntext').canon).toMatchObject({
                national: true,
            });
        });
    });

    describe('dates and times', () => {
        it('keeps the time zone only where the type has one', () => {
            for (const [source, type] of [
                ['postgresql', 'timestamp with time zone'],
                ['postgresql', 'timestamptz'],
                ['postgresql', 'timestamp_with_time_zone'],
                ['sqlserver', 'datetimeoffset'],
            ] as const) {
                expect(parse(source, type).canon).toEqual({
                    kind: 'datetime',
                    tz: true,
                });
            }
            for (const [source, type] of [
                ['postgresql', 'timestamp'],
                ['mysql', 'datetime'],
                ['mysql', 'timestamp'],
                ['sqlserver', 'datetime2'],
                ['sqlserver', 'smalldatetime'],
                ['sqlite', 'datetime'],
            ] as const) {
                expect(parse(source, type).canon).toEqual({
                    kind: 'datetime',
                    tz: false,
                });
            }
        });

        it('knows a SQL Server timestamp is a row version, not a date', () => {
            const parsed = parse('sqlserver', 'timestamp');
            expect(parsed.canon).toEqual({ kind: 'binary', length: 8 });
            expect(parsed.note).toMatch(/row version/);
        });
    });

    describe('everything else', () => {
        it('reads booleans and bits', () => {
            expect(parse('sqlserver', 'bit').canon).toEqual({ kind: 'bool' });
            expect(parse('mysql', 'bit').canon).toEqual({ kind: 'bool' });
            expect(parse('mysql', 'bit(8)').canon).toEqual({
                kind: 'bitstring',
                length: 8,
            });
            expect(parse('postgresql', 'boolean').canon).toEqual({
                kind: 'bool',
            });
            expect(
                parse('postgresql', 'bit', { characterMaximumLength: '4' })
                    .canon
            ).toMatchObject({ kind: 'bitstring' });
        });

        it('reads json, uuid and xml', () => {
            expect(parse('postgresql', 'jsonb').canon).toEqual({
                kind: 'json',
                binary: true,
            });
            expect(parse('postgresql', 'json').canon).toEqual({
                kind: 'json',
                binary: false,
            });
            expect(parse('mysql', 'json').canon).toEqual({
                kind: 'json',
                binary: true,
            });
            expect(parse('sqlserver', 'uniqueidentifier').canon).toEqual({
                kind: 'uuid',
            });
            expect(parse('postgresql', 'uuid').canon).toEqual({ kind: 'uuid' });
            expect(parse('sqlserver', 'xml').canon).toEqual({ kind: 'xml' });
        });

        it('reads binary data', () => {
            expect(parse('postgresql', 'bytea').canon).toEqual({
                kind: 'blob',
                size: 'long',
            });
            expect(parse('mysql', 'blob').canon).toEqual({
                kind: 'blob',
                size: 'regular',
            });
            expect(parse('sqlserver', 'image').canon).toEqual({
                kind: 'blob',
                size: 'long',
            });
            expect(
                parse('mysql', 'binary', { characterMaximumLength: '16' }).canon
            ).toEqual({ kind: 'binary', length: 16 });
            expect(
                parse('sqlserver', 'varbinary', {
                    characterMaximumLength: '-1',
                }).canon
            ).toEqual({ kind: 'varbinary', length: 'max' });
        });

        it('keeps the values of an enum when it has them, and says when it has not', () => {
            expect(parse('mysql', "enum('a','it''s')").canon).toEqual({
                kind: 'enum',
                values: ['a', "it's"],
            });
            const bare = parse('mysql', 'enum');
            expect(bare.canon).toEqual({ kind: 'enum' });
            expect(bare.note).toMatch(/values are not stored/);
        });

        it('stores the types with no equivalent as text, and says so', () => {
            for (const [source, type, pattern] of [
                ['mysql', 'set', /SET/],
                ['postgresql', 'inet', /inet/],
                ['postgresql', 'interval', /interval/],
                ['postgresql', 'point', /geometric/],
                ['postgresql', 'tsvector', /full text/],
                ['postgresql', 'int4range', /range/],
                ['sqlserver', 'sql_variant', /sql variant/],
                ['postgresql', 'something_new', /unknown type/],
            ] as const) {
                const parsed = parse(source, type);
                expect(['varchar', 'text']).toContain(parsed.canon.kind);
                expect(parsed.note).toMatch(pattern);
            }
        });

        it('keeps spatial types as such', () => {
            expect(parse('mysql', 'geometry').canon).toEqual({
                kind: 'geo',
                name: 'geometry',
            });
            expect(parse('sqlserver', 'geography').canon).toEqual({
                kind: 'geo',
                name: 'geography',
            });
            // PostgreSQL's point is not a spatial type of this kind
            expect(parse('postgresql', 'point').canon.kind).toBe('varchar');
        });
    });

    describe('custom and array types', () => {
        it('reads a PostgreSQL enum from the diagram, with its values', () => {
            const parsed = parseSourceType(
                field('c', 'order_status'),
                'postgresql',
                [
                    {
                        id: 'x',
                        name: 'order_status',
                        schema: 'public',
                        kind: DBCustomTypeKind.enum,
                        values: ['new', 'paid'],
                    },
                ]
            );
            expect(parsed.canon).toEqual({
                kind: 'enum',
                values: ['new', 'paid'],
            });
        });

        it('reads a composite type as JSON, and says so', () => {
            const parsed = parseSourceType(
                field('c', 'address'),
                'postgresql',
                [
                    {
                        id: 'x',
                        name: 'address',
                        kind: DBCustomTypeKind.composite,
                        fields: [{ field: 'street', type: 'text' }],
                    },
                ]
            );
            expect(parsed.canon).toEqual({ kind: 'json', binary: true });
            expect(parsed.note).toMatch(/composite/);
        });

        it('reads an array by its flag or its name', () => {
            for (const parsed of [
                parse('postgresql', 'text', { isArray: true }),
                parse('postgresql', 'integer[]'),
            ]) {
                expect(parsed.canon.kind).toBe('array');
                expect(parsed.note).toMatch(/array/);
            }
            expect(parse('postgresql', 'integer[]').canon).toMatchObject({
                of: { kind: 'int', bits: 32 },
            });
        });
    });
});
