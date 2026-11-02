import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import {
    diagram,
    field,
    pk,
    table,
} from '../cross-dialect/convert/__tests__/builders';
import { exportBaseSQL } from '../export-sql-script';

const exportAs = (type: DatabaseType, ...fields: ReturnType<typeof field>[]) =>
    exportBaseSQL({
        diagram: diagram(type, [table('t', fields)]),
        targetDatabaseType: type,
    });

describe('PostgreSQL export of defaults read from the database', () => {
    const pg = (...fields: ReturnType<typeof field>[]) =>
        exportAs(DatabaseType.POSTGRESQL, ...fields);

    it("drops the cast PostgreSQL adds to a text default: 'new'::character varying", () => {
        const sql = pg(
            field('status', 'character varying', {
                characterMaximumLength: '20',
                default: "'new'::character varying",
            })
        );
        expect(sql).toContain(`DEFAULT 'new'`);
        expect(sql).not.toContain("'''");
        expect(sql).not.toContain('::');
    });

    it('keeps a quote inside the text', () => {
        const sql = pg(field('s', 'text', { default: "'it''s'::text" }));
        expect(sql).toContain(`DEFAULT 'it''s'`);
    });

    it("handles '{}'::jsonb", () => {
        expect(pg(field('doc', 'jsonb', { default: "'{}'::jsonb" }))).toContain(
            `DEFAULT '{}'`
        );
    });

    it('keeps a function as a function, not as the text of one', () => {
        const sql = pg(field('id', 'uuid', { default: 'gen_random_uuid()' }));
        expect(sql).toContain('DEFAULT gen_random_uuid()');
        expect(sql).not.toContain("'gen_random_uuid()'");
    });

    it('still quotes a plain word, and leaves numbers and keywords alone', () => {
        const sql = pg(
            field('a', 'text', { default: 'hello' }),
            field('b', 'integer', { default: '0' }),
            field('c', 'boolean', { default: 'true' })
        );
        expect(sql).toContain(`"a" text DEFAULT 'hello'`);
        expect(sql).toContain('"b" integer DEFAULT 0');
        expect(sql).toContain('"c" boolean DEFAULT true');
    });

    it('does not give a serial column a second default', () => {
        const sql = pg(
            pk('id', 'integer', {
                increment: true,
                default: "nextval('t_id_seq'::regclass)",
            })
        );
        expect(sql).toContain('"id" serial NOT NULL');
        expect(sql).not.toMatch(/serial NOT NULL DEFAULT/);
    });

    it('still gives a column that is not serial its sequence default', () => {
        const sql = pg(
            field('n', 'integer', { default: "nextval('seq'::regclass)" })
        );
        expect(sql).toContain(`"n" integer DEFAULT nextval('seq'::regclass)`);
    });
});

describe('MySQL export', () => {
    it('writes a SET as text, since the diagram does not keep its values', () => {
        const sql = exportAs(DatabaseType.MYSQL, field('flags', 'set'));
        expect(sql).toContain('`flags` VARCHAR(255)');
        expect(sql).not.toMatch(/`flags` set/i);
    });
});

describe('SQL Server export of defaults read from the database', () => {
    it('unwraps a function default such as (newid())', () => {
        const sql = exportAs(
            DatabaseType.SQL_SERVER,
            field('guid', 'uniqueidentifier', { default: '(newid())' }),
            field('at', 'datetime2', { default: '(sysdatetime())' })
        );
        expect(sql).toContain('DEFAULT newid()');
        expect(sql).toContain('DEFAULT sysdatetime()');
        expect(sql).not.toContain("'(newid())'");
    });

    it('still handles the forms it already did', () => {
        const sql = exportAs(
            DatabaseType.SQL_SERVER,
            field('a', 'int', { default: '((0))' }),
            field('b', 'nvarchar', { default: "(N'x')" }),
            field('c', 'datetime', { default: '(getdate())' })
        );
        expect(sql).toContain('DEFAULT 0');
        expect(sql).toContain("DEFAULT N'x'");
        expect(sql).toContain('DEFAULT getdate()');
    });
});
