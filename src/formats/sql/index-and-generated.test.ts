import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import type { DatabaseType } from '@/core/model/database';
import { convertDesign } from '@/dialects/convert/engine';
import { dialectFor } from '@/dialects/registry';
import { exportSql } from './export-sql';
import { importSql } from './import-sql';

// SQL files carry DESC, partial-index predicates, computed columns and (in
// PostgreSQL) domains; reading a script keeps them, and a script written from
// a design reads back as the same design (rewrite/phase9/live-checks.md,
// "Third pass").

const projection = (design: Design) =>
    listOf(design.entities).map((e) => ({
        name: e.name,
        columns: e.columnIds.map((id) => {
            const c = design.columns[id];
            return {
                name: c.name,
                type: c.type.name,
                length: c.length,
                nullable: c.nullable,
                unique: c.unique,
                domain: c.domain,
                generated: c.generated,
            };
        }),
        // the writers sort index statements, so the order is not compared
        keys: e.keyIds
            .map((id) => design.keys[id])
            .filter((k) => !k.pk)
            .map((k) => ({
                distinct: k.distinct,
                members: k.members.map((m) => design.columns[m].name),
                descending: (k.descending ?? []).map(
                    (m) => design.columns[m].name
                ),
                where: k.where,
            }))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }));

const table = (design: Design, name: string) => {
    const e = listOf(design.entities).find((x) => x.name === name)!;
    return {
        columns: e.columnIds.map((id) => design.columns[id]),
        keys: e.keyIds.map((id) => design.keys[id]),
    };
};

function roundTrip(sql: string, type: DatabaseType) {
    const first = importSql(sql, type);
    expect(first.design, JSON.stringify(first.diagnostics)).toBeDefined();
    const out = exportSql(first.design!, type);
    const second = importSql(out.text, type);
    expect(second.design, out.text).toBeDefined();
    expect(projection(second.design!)).toEqual(projection(first.design!));
    return { first, second, text: out.text };
}

describe('PostgreSQL script', () => {
    const SQL = `
CREATE DOMAIN email_address AS varchar(120) NOT NULL CHECK (VALUE LIKE '%@%');
CREATE DOMAIN pos_int AS integer;
CREATE TABLE sales.customers (
    id serial PRIMARY KEY,
    email email_address,
    qty public.pos_int NOT NULL,
    first_name text,
    last_name text,
    deleted_at timestamp,
    score integer,
    full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    initials text GENERATED ALWAYS AS (left(first_name, 1)) VIRTUAL
);
CREATE INDEX customers_score_desc ON sales.customers (score DESC, last_name ASC NULLS LAST);
CREATE UNIQUE INDEX customers_email_live ON sales.customers USING btree (email) WHERE (deleted_at IS NULL);
CREATE INDEX customers_live ON sales.customers (last_name) INCLUDE (first_name) WHERE deleted_at IS NULL AND score > 0;
CREATE INDEX customers_lower ON sales.customers (lower(last_name), first_name);
`;

    it('reads DESC, WHERE, generated columns and domains', () => {
        const r = importSql(SQL, 'postgresql');
        const t = table(r.design!, 'customers');
        const col = (n: string) => t.columns.find((c) => c.name === n)!;
        const key = (n: string) => t.keys.find((k) => k.label === n)!;
        const names = (ids: string[]) =>
            ids.map((i) => r.design!.columns[i].name);

        expect(names(key('customers_score_desc').descending!)).toEqual([
            'score',
        ]);
        expect(names(key('customers_score_desc').members)).toEqual([
            'score',
            'last_name',
        ]);
        expect(key('customers_email_live').where).toBe('(deleted_at IS NULL)');
        expect(key('customers_live').where).toBe(
            'deleted_at IS NULL AND score > 0'
        );
        expect(key('customers_email_live').distinct).toBe(true);
        // a partial unique index does not make the column unique
        expect(col('email').unique).toBe(false);
        expect(
            key('customers_lower').members.map((m) => r.design!.columns[m].name)
        ).toEqual(['first_name']);

        expect(col('full_name').generated).toEqual({
            expression: "first_name || ' ' || last_name",
            stored: true,
        });
        expect(col('initials').generated).toEqual({
            expression: 'left(first_name, 1)',
            stored: false,
        });
        expect(col('email').domain).toBe('email_address');
        expect(col('email').type.name).toBe('varchar');
        expect(col('email').length).toBe(120);
        expect(col('qty').domain).toBe('pos_int');
        expect(col('qty').type.name).toBe('integer');
        expect(col('first_name').domain).toBeUndefined();
    });

    it('says what it cannot keep', () => {
        const messages = importSql(SQL, 'postgresql').diagnostics.map(
            (d) => d.message
        );
        expect(
            messages.some((m) => /Domain email_address.*CHECK/.test(m))
        ).toBe(true);
        expect(messages.some((m) => /customers_live.*INCLUDE/.test(m))).toBe(
            true
        );
        expect(
            messages.some((m) => /customers_lower.*lower\(last_name\)/.test(m))
        ).toBe(true);
        expect(messages.some((m) => /CREATE DOMAIN.*skipped/.test(m))).toBe(
            false
        );
    });

    it('a domain over a domain gets the innermost base type', () => {
        const r = importSql(
            'CREATE DOMAIN a AS varchar(10);\nCREATE DOMAIN b AS a;\nCREATE TABLE t (x b);',
            'postgresql'
        );
        const c = table(r.design!, 't').columns[0];
        expect(c.domain).toBe('b');
        expect(c.type.name).toBe('varchar');
        expect(c.length).toBe(10);
    });

    it('is the same design after export and import', () => {
        const { text } = roundTrip(SQL, 'postgresql');
        expect(text).toContain('CREATE DOMAIN email_address AS varchar(120);');
        expect(text).toContain('"email" email_address');
        expect(text).toContain('"score" DESC');
        expect(text).toContain('WHERE (deleted_at IS NULL);');
        expect(text).toContain('STORED');
    });
});

describe('SQLite script', () => {
    const SQL = `
CREATE TABLE people (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    archived INTEGER,
    full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    initial TEXT AS (substr(first_name, 1, 1)),
    shout TEXT AS (upper(last_name)) VIRTUAL,
    untyped AS (id + 1)
);
CREATE INDEX people_name ON people (last_name DESC, first_name);
CREATE UNIQUE INDEX people_live ON people (last_name) WHERE archived = 0;
`;
    it('reads them', () => {
        const r = importSql(SQL, 'sqlite');
        const t = table(r.design!, 'people');
        const col = (n: string) => t.columns.find((c) => c.name === n)!;
        expect(col('full_name').generated).toEqual({
            expression: "first_name || ' ' || last_name",
            stored: true,
        });
        expect(col('initial').generated).toEqual({
            expression: 'substr(first_name, 1, 1)',
            stored: false,
        });
        expect(col('shout').generated?.stored).toBe(false);
        expect(col('untyped').generated?.expression).toBe('id + 1');
        expect(col('untyped').type.name).toBe('text');
        expect(
            r.diagnostics.some((d) =>
                /Computed column untyped has no type/.test(d.message)
            )
        ).toBe(true);
        const desc = t.keys.find((k) => k.label === 'people_name')!;
        expect(desc.descending).toEqual([col('last_name').id]);
        expect(t.keys.find((k) => k.label === 'people_live')!.where).toBe(
            'archived = 0'
        );
    });
    it('is the same design after export and import', () => {
        const { text } = roundTrip(SQL, 'sqlite');
        expect(text).toContain('DESC');
        expect(text).toContain('WHERE archived = 0');
    });
});

describe('MySQL and MariaDB script', () => {
    const SQL = `
CREATE TABLE \`people\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`first_name\` varchar(50) DEFAULT NULL,
  \`last_name\` varchar(50) DEFAULT NULL,
  \`full_name\` varchar(101) GENERATED ALWAYS AS (concat(\`first_name\`,' ',\`last_name\`)) STORED,
  \`initials\` varchar(3) GENERATED ALWAYS AS (left(\`first_name\`,1)) VIRTUAL,
  \`short\` varchar(1) AS (left(\`last_name\`,1)),
  \`short_stored\` varchar(1) AS (left(\`last_name\`,1)) STORED NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`k_desc\` (\`last_name\` DESC, \`first_name\`)
);
CREATE INDEX idx_people_first ON people (first_name DESC);
`;
    for (const type of ['mysql', 'mariadb'] as const) {
        it(`${type}: reads them and round-trips`, () => {
            const r = importSql(SQL, type);
            const t = table(r.design!, 'people');
            const col = (n: string) => t.columns.find((c) => c.name === n)!;
            expect(col('full_name').generated).toEqual({
                expression: "concat(`first_name`,' ',`last_name`)",
                stored: true,
            });
            expect(col('initials').generated?.stored).toBe(false);
            expect(col('short').generated).toEqual({
                expression: 'left(`last_name`,1)',
                stored: false,
            });
            expect(col('short_stored').generated?.stored).toBe(true);
            expect(col('short_stored').nullable).toBe(false);
            expect(
                t.keys.find((k) => k.label === 'k_desc')!.descending
            ).toEqual([col('last_name').id]);
            expect(
                t.keys.find((k) => k.label === 'idx_people_first')!.descending
            ).toEqual([col('first_name').id]);
            roundTrip(SQL, type);
        });
    }
    it('MySQL says a partial index loses its WHERE when written', () => {
        const r = importSql(
            'CREATE TABLE t (a int, b int);\nCREATE INDEX i ON t (a) WHERE b > 1;',
            'mysql'
        );
        expect(table(r.design!, 't').keys[0].where).toBe('b > 1');
        const out = exportSql(r.design!, 'mysql');
        expect(out.text).not.toContain('WHERE');
        expect(out.diagnostics.map((d) => d.message).join()).toMatch(
            /MySQL has no partial indexes/
        );
    });
});

describe('SQL Server script', () => {
    const SQL = `
CREATE TABLE [dbo].[Orders] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Net] DECIMAL(10, 2) NOT NULL,
    [Tax] DECIMAL(10, 2) NOT NULL,
    [Gross] AS ([Net] + [Tax]),
    [GrossStored] AS ([Net] + [Tax]) PERSISTED NOT NULL,
    [Deleted] DATETIME2 NULL,
    CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED ([Id])
)
GO
CREATE NONCLUSTERED INDEX [IX_Orders_Net] ON [dbo].[Orders] ([Net] DESC, [Tax] ASC) WHERE [Deleted] IS NULL WITH (FILLFACTOR = 80) ON [PRIMARY]
GO
CREATE UNIQUE INDEX [IX_Orders_Live] ON [dbo].[Orders] ([Tax]) WHERE ([Deleted] IS NULL)
GO
`;
    it('reads them', () => {
        const r = importSql(SQL, 'sql_server');
        const t = table(r.design!, 'Orders');
        const col = (n: string) => t.columns.find((c) => c.name === n)!;
        expect(col('Gross').generated).toEqual({
            expression: '[Net] + [Tax]',
            stored: false,
        });
        expect(col('GrossStored').generated?.stored).toBe(true);
        expect(col('GrossStored').nullable).toBe(false);
        expect(col('Gross').type.name).toBe('varchar');
        expect(
            r.diagnostics.some((d) =>
                /Computed column Gross has no type/.test(d.message)
            )
        ).toBe(true);
        const k = t.keys.find((x) => x.label === 'IX_Orders_Net')!;
        expect(k.descending).toEqual([col('Net').id]);
        expect(k.where).toBe('[Deleted] IS NULL');
        const live = t.keys.find((x) => x.label === 'IX_Orders_Live')!;
        expect(live.where).toBe('([Deleted] IS NULL)');
        expect(col('Tax').unique).toBe(false);
    });
    it('is the same design after export and import', () => {
        const { text } = roundTrip(SQL, 'sql_server');
        expect(text).toContain('[Gross] AS ([Net] + [Tax]),');
        expect(text).toContain(
            '[GrossStored] AS ([Net] + [Tax]) PERSISTED NOT NULL'
        );
        expect(text).toContain('[Net] DESC');
        expect(text).toContain('WHERE [Deleted] IS NULL;');
    });
});

describe('conversion', () => {
    it('SQL Server target: keeps DESC, says what it leaves out', () => {
        const pg = importSql(
            `CREATE TABLE c (id int PRIMARY KEY, s int, d timestamp, f int GENERATED ALWAYS AS (s + 1) STORED);
CREATE INDEX c_s ON c (s DESC) WHERE d IS NULL;`,
            'postgresql'
        );
        const out = convertDesign(
            pg.design!,
            dialectFor('postgresql'),
            dialectFor('sql_server')
        );
        expect(out.text).toContain('[s] DESC');
        expect(out.text).toMatch(
            /c_s: partial index created without its WHERE/
        );
        expect(out.text).toMatch(
            /c\.f: computed column created as an ordinary column/
        );
    });
});
