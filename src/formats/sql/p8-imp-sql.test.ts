import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import { TABLE_WIDTH } from '@/core/model/entity';
import { detectDialect, dialectFor, listDialects } from '@/dialects/registry';
import { cardHeight } from '../shared/layout';
import { exportSql } from './export-sql';
import { importSql } from './import-sql';

const named = (d: Design, name: string) =>
    listOf(d.entities).find((e) => e.name === name)!;

describe('IMP-001 the kept dialects', () => {
    it('offers Generic first, then PostgreSQL, MySQL, SQL Server, MariaDB, SQLite, CockroachDB', () => {
        expect(listDialects().map((d) => d.id)).toEqual([
            'generic',
            'postgresql',
            'mysql',
            'sql_server',
            'mariadb',
            'sqlite',
            'cockroachdb',
        ]);
    });
    it('Oracle and ClickHouse have no SQL reader or writer', () => {
        for (const id of ['oracle', 'clickhouse'] as const) {
            expect(listDialects().some((d) => d.id === id)).toBe(false);
            expect(dialectFor(id).sql.read).toBeUndefined();
            expect(dialectFor(id).sql.write).toBeUndefined();
            expect(importSql('CREATE TABLE a (id int);', id).design).toBe(
                undefined
            );
        }
    });
});

describe('IMP-002 MariaDB uses the MySQL code, CockroachDB the PostgreSQL code', () => {
    it('names the dialect they reuse', () => {
        expect(dialectFor('mariadb').variantOf).toBe('mysql');
        expect(dialectFor('cockroachdb').variantOf).toBe('postgresql');
    });
    it('MariaDB reads MySQL text and exports the same text as MySQL', () => {
        const sql =
            'CREATE TABLE `a` (`id` int NOT NULL AUTO_INCREMENT, `n` varchar(10), PRIMARY KEY (`id`)) ENGINE=InnoDB;';
        const m = importSql(sql, 'mariadb');
        expect(m.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(named(m.design!, 'a')).toBeTruthy();
        const asMysql = importSql(sql, 'mysql').design!;
        expect(exportSql(m.design!, 'mariadb').text).toBe(
            exportSql(asMysql, 'mysql').text
        );
    });
    it('CockroachDB reads PostgreSQL text', () => {
        const r = importSql(
            'CREATE TABLE a (id serial PRIMARY KEY, tags text[]);',
            'cockroachdb'
        );
        expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(r.design!.databaseType).toBe('cockroachdb');
        expect(named(r.design!, 'a')).toBeTruthy();
    });
});

describe('IMP-008 detecting the dialect for Generic text', () => {
    it.each([
        [
            'pg_dump SET line',
            'SET statement_timeout = 0;\nCREATE TABLE a (id int);',
            'postgresql',
        ],
        [
            'ALTER TABLE ONLY',
            'ALTER TABLE ONLY a ADD CONSTRAINT x PRIMARY KEY (id);',
            'postgresql',
        ],
        ['COPY from stdin', 'COPY a (id) FROM stdin;\n1\n\\.', 'postgresql'],
        [
            'SQL Server brackets',
            'CREATE TABLE [dbo].[a] ([id] INT);',
            'sql_server',
        ],
        [
            'SQL Server IDENTITY(',
            'CREATE TABLE a (id INT IDENTITY(1,1));',
            'sql_server',
        ],
        [
            'MySQL dump comment',
            '-- MySQL dump 10.13\nCREATE TABLE a (id int);',
            'mysql',
        ],
        [
            'MySQL backticks and two markers',
            'CREATE TABLE IF NOT EXISTS `a` (`id` int) ENGINE=InnoDB;',
            'mysql',
        ],
        [
            'SQLite PRAGMA',
            'PRAGMA foreign_keys = ON;\nCREATE TABLE a (id int);',
            'sqlite',
        ],
        [
            'SQLite AUTOINCREMENT',
            'CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT);',
            'sqlite',
        ],
        [
            'SERIAL PRIMARY KEY',
            'CREATE TABLE a (id SERIAL PRIMARY KEY);',
            'postgresql',
        ],
        ['CREATE EXTENSION', 'CREATE EXTENSION pgcrypto;', 'postgresql'],
        ['AUTO_INCREMENT', 'CREATE TABLE a (id int AUTO_INCREMENT);', 'mysql'],
        ['nothing matches', 'CREATE TABLE a (id int);', 'postgresql'],
    ] as const)('%s', (_name, text, expected) => {
        expect(detectDialect(text)).toBe(expected);
    });
    it('the pg_dump rule is checked before SQL Server and MySQL rules', () => {
        expect(
            detectDialect(
                'SET client_encoding = 1;\nCREATE TABLE [dbo].[a] (id int);'
            )
        ).toBe('postgresql');
    });
    it('Generic reads a detected MySQL script with the MySQL reader and keeps the Generic type', () => {
        const r = importSql(
            'CREATE TABLE `a` (`id` int AUTO_INCREMENT, PRIMARY KEY (`id`));',
            'generic'
        );
        expect(r.design!.databaseType).toBe('generic');
        expect(named(r.design!, 'a')).toBeTruthy();
    });
});

describe('IMP-022 direction and cardinality of imported links', () => {
    const sql = `CREATE TABLE p (id int PRIMARY KEY, code int UNIQUE);
CREATE TABLE c (id int PRIMARY KEY, p_id int REFERENCES p(id), p_code int UNIQUE REFERENCES p(code));
CREATE TABLE one (p_id int PRIMARY KEY REFERENCES p(id));`;
    const d = importSql(sql, 'postgresql').design!;
    const links = listOf(d.links);
    it('the referenced table is the source and the holder the target', () => {
        for (const l of links) {
            expect(d.entities.byId[l.sourceEntityId].name).toBe('p');
            expect(d.entities.byId[l.targetEntityId].name).not.toBe('p');
        }
    });
    it('cardinality follows uniqueness and never many to many', () => {
        const to = (t: string, col: string) =>
            links.find(
                (l) =>
                    d.entities.byId[l.targetEntityId].name === t &&
                    d.columns[l.targetColumnId].name === col
            )!;
        expect(to('c', 'p_id')).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        expect(to('c', 'p_code')).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
        expect(to('one', 'p_id')).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'one',
        });
        expect(
            links.some(
                (l) =>
                    l.sourceCardinality === 'many' &&
                    l.targetCardinality === 'many'
            )
        ).toBe(false);
    });
    it('a key to a column that is not unique still points at one row', () => {
        const r = importSql(
            'CREATE TABLE p (id int, x int); CREATE TABLE c (p_x int, FOREIGN KEY (p_x) REFERENCES p(x));',
            'postgresql'
        ).design!;
        expect(listOf(r.links)[0].sourceCardinality).toBe('one');
    });
});

describe('IMP-040 IMP-044 what an imported diagram carries', () => {
    const sql = `CREATE TABLE a (id int PRIMARY KEY);
CREATE VIEW v AS SELECT id FROM a;
CREATE MATERIALIZED VIEW mv AS SELECT id FROM a;`;
    const r = importSql(sql, 'postgresql', { now: 1000 });
    const d = r.design!;
    it('colours tables, views and materialized views', () => {
        expect(named(d, 'a').color).toBe('#8eb7ff');
        expect(named(d, 'v')).toMatchObject({ kind: 'view', color: '#b0b0b0' });
        expect(named(d, 'mv')).toMatchObject({
            kind: 'view',
            materialized: true,
            color: '#7d7d7d',
        });
    });
    it('gives every record a fresh id on each import', () => {
        const again = importSql(sql, 'postgresql').design!;
        expect(again.id).not.toBe(d.id);
        const ids = (x: Design) => [
            ...x.entities.order,
            ...Object.keys(x.columns),
        ];
        const first = new Set(ids(d));
        expect(ids(again).some((id) => first.has(id))).toBe(false);
        expect(new Set(ids(d)).size).toBe(ids(d).length);
    });
    it('dates are the given time', () => {
        expect(d.createdAt).toBe(1000);
        expect(d.updatedAt).toBe(1000);
    });
    it('is named "SQL Import (<type>)" unless the dialog gives a name', () => {
        expect(d.name).toBe('SQL Import (PostgreSQL)');
        expect(importSql(sql, 'mysql').design!.name).toBe('SQL Import (MySQL)');
        expect(
            importSql(sql, 'postgresql', { name: 'Diagram 3' }).design!.name
        ).toBe('Diagram 3');
    });
});

describe('IMP-043 tables of different schemas do not overlap', () => {
    it('no two cards overlap, per schema group', () => {
        const sql = `CREATE TABLE s1.a (id int primary key);
CREATE TABLE s1.b (id int primary key, a_id int references s1.a(id));
CREATE TABLE s1.c (id int primary key, a_id int references s1.a(id));
CREATE TABLE s2.d (id int primary key);
CREATE TABLE s2.e (id int primary key, d_id int references s2.d(id));
CREATE TABLE s3.f (id int);
CREATE TABLE s3.g (id int);`;
        const d = importSql(sql, 'postgresql').design!;
        const rects = listOf(d.entities).map((e) => ({
            n: e.name,
            x: e.x,
            y: e.y,
            w: TABLE_WIDTH.default,
            h: cardHeight(e.columnIds.length),
        }));
        for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i];
                const b = rects[j];
                const apart =
                    a.x + a.w <= b.x ||
                    b.x + b.w <= a.x ||
                    a.y + a.h <= b.y ||
                    b.y + b.h <= a.y;
                expect(apart, `${a.n} and ${b.n}`).toBe(true);
            }
    });
});
