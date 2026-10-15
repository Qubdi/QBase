import { describe, expect, it } from 'vitest';
import type { Canon, TargetDialect } from '../canonical';
import { renderType } from '../render-type';

const sql = (target: TargetDialect, canon: Canon, isKey = false) =>
    renderType(target, canon, { isKey }).sql;

const int = (bits: 8 | 16 | 24 | 32 | 64, unsigned = false): Canon => ({
    kind: 'int',
    bits,
    ...(unsigned ? { unsigned } : {}),
});

describe('writing a neutral type for each database', () => {
    describe('integers', () => {
        it.each([
            [int(8), 'smallint', 'TINYINT', 'SMALLINT', 'INTEGER'],
            [int(16), 'smallint', 'SMALLINT', 'SMALLINT', 'INTEGER'],
            [int(24), 'integer', 'MEDIUMINT', 'INT', 'INTEGER'],
            [int(32), 'integer', 'INT', 'INT', 'INTEGER'],
            [int(64), 'bigint', 'BIGINT', 'BIGINT', 'INTEGER'],
        ] as const)('%j', (canon, pg, mysql, mssql, sqlite) => {
            expect(sql('postgresql', canon)).toBe(pg);
            expect(sql('mysql', canon)).toBe(mysql);
            expect(sql('sqlserver', canon)).toBe(mssql);
            expect(sql('sqlite', canon)).toBe(sqlite);
        });

        it('uses the next size up where there is no unsigned type', () => {
            // PostgreSQL and SQL Server have no unsigned integers (except SQL Server's tinyint)
            expect(sql('postgresql', int(8, true))).toBe('smallint');
            expect(sql('postgresql', int(16, true))).toBe('integer');
            expect(sql('postgresql', int(32, true))).toBe('bigint');
            expect(sql('postgresql', int(64, true))).toBe('numeric(20, 0)');
            expect(sql('sqlserver', int(8, true))).toBe('TINYINT');
            expect(sql('sqlserver', int(32, true))).toBe('BIGINT');
            expect(sql('sqlserver', int(64, true))).toBe('DECIMAL(20, 0)');
            expect(sql('mysql', int(8, true))).toBe('TINYINT UNSIGNED');
        });
    });

    describe('decimals', () => {
        it('writes precision and scale, and a default when there are none', () => {
            const d: Canon = { kind: 'decimal', precision: 10, scale: 2 };
            expect(sql('postgresql', d)).toBe('numeric(10, 2)');
            expect(sql('mysql', d)).toBe('DECIMAL(10, 2)');
            expect(sql('sqlserver', d)).toBe('DECIMAL(10, 2)');
            expect(sql('sqlite', d)).toBe('DECIMAL(10, 2)');
            const bare: Canon = { kind: 'decimal' };
            expect(sql('postgresql', bare)).toBe('numeric');
            expect(sql('sqlite', bare)).toBe('NUMERIC');
            const mysql = renderType('mysql', bare, { isKey: false });
            expect(mysql.sql).toBe('DECIMAL(38, 10)');
            expect(mysql.note).toMatch(/no precision/);
        });

        it('shrinks a precision the database cannot hold, and says so', () => {
            const huge: Canon = { kind: 'decimal', precision: 80, scale: 5 };
            const mssql = renderType('sqlserver', huge, { isKey: false });
            expect(mssql.sql).toBe('DECIMAL(38, 5)');
            expect(mssql.note).toMatch(/larger than this database allows/);
            expect(sql('mysql', huge)).toBe('DECIMAL(65, 5)');
            expect(sql('postgresql', huge)).toBe('numeric(80, 5)');
        });

        it('says once, for the whole script, that SQLite has no exact decimal', () => {
            const rendered = renderType(
                'sqlite',
                { kind: 'decimal', precision: 5, scale: 1 },
                { isKey: false }
            );
            expect(rendered.general).toMatch(/NUMERIC affinity/);
        });
    });

    describe('text', () => {
        const varchar = (length?: number | 'max', national = true): Canon => ({
            kind: 'varchar',
            length,
            national,
        });
        const text = (
            size: 'tiny' | 'regular' | 'medium' | 'long',
            national = true
        ): Canon => ({
            kind: 'text',
            size,
            national,
        });

        it('writes a limited string for each database', () => {
            expect(sql('postgresql', varchar(50))).toBe('varchar(50)');
            expect(sql('mysql', varchar(50))).toBe('VARCHAR(50)');
            expect(sql('sqlserver', varchar(50))).toBe('NVARCHAR(50)');
            expect(sql('sqlserver', varchar(50, false))).toBe('VARCHAR(50)');
            expect(sql('sqlite', varchar(50))).toBe('VARCHAR(50)');
        });

        it('writes an unlimited one', () => {
            for (const unlimited of [
                varchar(undefined),
                varchar('max'),
                text('long'),
            ]) {
                expect(sql('postgresql', unlimited)).toBe('text');
                expect(sql('mysql', unlimited)).toBe('LONGTEXT');
                expect(sql('sqlserver', unlimited)).toBe('NVARCHAR(MAX)');
                expect(sql('sqlite', unlimited)).toBe('TEXT');
            }
            expect(sql('sqlserver', text('long', false))).toBe('VARCHAR(MAX)');
        });

        it('keeps the size of a MySQL text type', () => {
            expect(sql('mysql', text('tiny'))).toBe('TINYTEXT');
            expect(sql('mysql', text('regular'))).toBe('TEXT');
            expect(sql('mysql', text('medium'))).toBe('MEDIUMTEXT');
            expect(sql('mysql', text('long'))).toBe('LONGTEXT');
        });

        it('limits a text column that is part of a key, because MySQL and SQL Server cannot index the rest', () => {
            const mysql = renderType('mysql', text('long'), { isKey: true });
            expect(mysql.sql).toBe('VARCHAR(255)');
            expect(mysql.note).toMatch(/part of a key/);
            const mssql = renderType('sqlserver', text('long'), {
                isKey: true,
            });
            expect(mssql.sql).toBe('NVARCHAR(450)');
            expect(sql('sqlserver', text('long', false), true)).toBe(
                'VARCHAR(900)'
            );
            // nothing to limit for PostgreSQL and SQLite
            expect(sql('postgresql', text('long'), true)).toBe('text');
            expect(sql('sqlite', text('long'), true)).toBe('TEXT');
        });

        it('shortens a long key column to what an index can hold', () => {
            expect(sql('mysql', varchar(2000), true)).toBe('VARCHAR(768)');
            expect(sql('sqlserver', varchar(2000), true)).toBe('NVARCHAR(450)');
            expect(sql('mysql', varchar(255), true)).toBe('VARCHAR(255)');
        });

        it('falls back to a bigger type when a column is longer than the database allows', () => {
            expect(sql('mysql', varchar(20000))).toBe('MEDIUMTEXT');
            expect(sql('sqlserver', varchar(9000, false))).toBe('VARCHAR(MAX)');
            expect(sql('sqlserver', varchar(5000))).toBe('NVARCHAR(MAX)');
            expect(
                sql('mysql', { kind: 'char', length: 300, national: true })
            ).toBe('VARCHAR(300)');
        });

        it('writes a fixed length string', () => {
            const c: Canon = { kind: 'char', length: 8, national: true };
            expect(sql('postgresql', c)).toBe('char(8)');
            expect(sql('mysql', c)).toBe('CHAR(8)');
            expect(sql('sqlserver', c)).toBe('NCHAR(8)');
            expect(sql('sqlserver', { ...c, national: false } as Canon)).toBe(
                'CHAR(8)'
            );
            expect(sql('postgresql', { kind: 'char', national: true })).toBe(
                'char(1)'
            );
        });
    });

    describe('dates, booleans, json and the rest', () => {
        it('writes dates and times', () => {
            expect(sql('postgresql', { kind: 'datetime', tz: false })).toBe(
                'timestamp'
            );
            expect(sql('postgresql', { kind: 'datetime', tz: true })).toBe(
                'timestamptz'
            );
            expect(sql('mysql', { kind: 'datetime', tz: false })).toBe(
                'DATETIME'
            );
            expect(sql('sqlserver', { kind: 'datetime', tz: false })).toBe(
                'DATETIME2'
            );
            expect(sql('sqlserver', { kind: 'datetime', tz: true })).toBe(
                'DATETIMEOFFSET'
            );
            expect(sql('sqlite', { kind: 'datetime', tz: false })).toBe(
                'DATETIME'
            );
            expect(sql('postgresql', { kind: 'date' })).toBe('date');
            expect(sql('mysql', { kind: 'time', tz: false })).toBe('TIME');
        });

        it('warns when a time zone cannot be kept', () => {
            const tz: Canon = { kind: 'datetime', tz: true };
            expect(renderType('mysql', tz, { isKey: false }).note).toMatch(
                /no time zone/
            );
            expect(renderType('sqlite', tz, { isKey: false }).note).toMatch(
                /no time zone/
            );
            expect(
                renderType('postgresql', tz, { isKey: false }).note
            ).toBeUndefined();
            expect(
                renderType('sqlserver', tz, { isKey: false }).note
            ).toBeUndefined();
        });

        it('writes booleans, uuids and json', () => {
            expect(sql('postgresql', { kind: 'bool' })).toBe('boolean');
            expect(sql('mysql', { kind: 'bool' })).toBe('TINYINT(1)');
            expect(sql('sqlserver', { kind: 'bool' })).toBe('BIT');
            expect(sql('sqlite', { kind: 'bool' })).toBe('BOOLEAN');
            expect(sql('postgresql', { kind: 'uuid' })).toBe('uuid');
            expect(sql('mysql', { kind: 'uuid' })).toBe('CHAR(36)');
            expect(sql('sqlserver', { kind: 'uuid' })).toBe('UNIQUEIDENTIFIER');
            expect(sql('sqlite', { kind: 'uuid' })).toBe('CHAR(36)');
            expect(sql('postgresql', { kind: 'json', binary: true })).toBe(
                'jsonb'
            );
            expect(sql('postgresql', { kind: 'json', binary: false })).toBe(
                'json'
            );
            expect(sql('mysql', { kind: 'json', binary: true })).toBe('JSON');
            expect(sql('sqlite', { kind: 'json', binary: true })).toBe('TEXT');
            const mssql = renderType(
                'sqlserver',
                { kind: 'json', binary: true },
                { isKey: false }
            );
            expect(mssql.sql).toBe('NVARCHAR(MAX)');
            expect(mssql.note).toMatch(/stored as text/);
        });

        it('writes binary data', () => {
            expect(sql('postgresql', { kind: 'blob', size: 'long' })).toBe(
                'bytea'
            );
            expect(sql('mysql', { kind: 'blob', size: 'long' })).toBe(
                'LONGBLOB'
            );
            expect(sql('mysql', { kind: 'varbinary', length: 64 })).toBe(
                'VARBINARY(64)'
            );
            expect(sql('sqlserver', { kind: 'blob', size: 'long' })).toBe(
                'VARBINARY(MAX)'
            );
            expect(sql('sqlserver', { kind: 'binary', length: 16 })).toBe(
                'BINARY(16)'
            );
            expect(sql('sqlite', { kind: 'varbinary', length: 64 })).toBe(
                'BLOB'
            );
        });

        it('turns an enum into a limited string, and a CHECK where there is no ENUM', () => {
            const e: Canon = { kind: 'enum', values: ['a', "it's"] };
            expect(sql('mysql', e)).toBe("ENUM('a', 'it''s')");
            for (const target of [
                'postgresql',
                'sqlserver',
                'sqlite',
            ] as const) {
                expect(
                    renderType(target, e, { isKey: false }).enumCheck
                ).toEqual(['a', "it's"]);
            }
            expect(sql('mysql', { kind: 'enum' })).toBe('VARCHAR(255)');
        });

        it('keeps arrays as text on databases that have none', () => {
            const arr: Canon = { kind: 'array', of: { kind: 'int', bits: 32 } };
            expect(sql('postgresql', arr)).toBe('integer[]');
            expect(sql('mysql', arr)).toBe('JSON');
            expect(sql('sqlserver', arr)).toBe('NVARCHAR(MAX)');
            expect(sql('sqlite', arr)).toBe('TEXT');
        });

        it('keeps bit strings and spatial types as close as it can', () => {
            expect(sql('mysql', { kind: 'bitstring', length: 8 })).toBe(
                'BIT(8)'
            );
            expect(sql('sqlserver', { kind: 'bitstring', length: 16 })).toBe(
                'BINARY(2)'
            );
            expect(sql('postgresql', { kind: 'bitstring', length: 8 })).toBe(
                'bit(8)'
            );
            expect(sql('mysql', { kind: 'geo', name: 'point' })).toBe('POINT');
            expect(sql('mysql', { kind: 'geo', name: 'geography' })).toBe(
                'GEOMETRY'
            );
            expect(sql('sqlserver', { kind: 'geo', name: 'geography' })).toBe(
                'GEOGRAPHY'
            );
            expect(sql('postgresql', { kind: 'geo', name: 'geometry' })).toBe(
                'bytea'
            );
        });
    });
});
