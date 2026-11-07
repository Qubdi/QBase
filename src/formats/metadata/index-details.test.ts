import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { rng } from '@/core/testing/helpers';
import type { Design } from '@/core/model/design';
import { parse } from '@/core/wire/parse';
import { serialise } from '@/core/wire/serialise';
import { validateDiagramFile } from '@/core/wire/validate-file';
import { writeMysql } from '@/dialects/mysql/write';
import { writePostgres } from '@/dialects/postgresql/write';
import { writeSqlite } from '@/dialects/sqlite/write';
import { convertDesign } from '@/dialects/convert/engine';
import { dialectFor } from '@/dialects/registry';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { loadFromDatabaseMetadata } from './load';
import mariadb from './fixtures/live-mariadb-11.json';
import mysql from './fixtures/live-mysql-8.json';
import pg16 from './fixtures/live-postgresql-16.json';
import pg18 from './fixtures/live-postgresql-18.json';

// The fixtures are what the client scripts returned from throwaway PostgreSQL
// 18.6 / 16.15, MySQL 8.4 and MariaDB 11.8 (rewrite/phase9/live-checks.md),
// kept as hand-written JSON. The server's POST /api/introspect returns the
// same shape (server/test/introspect-extras.test.ts).

const load = (
    json: unknown,
    databaseType: 'postgresql' | 'mysql' | 'mariadb'
) =>
    loadFromDatabaseMetadata({
        databaseType,
        databaseMetadata: DatabaseMetadata.parse(json),
        now: 1,
        random: rng(),
    });

const table = (design: Design, name: string) => {
    const entity = listOf(design.entities).find((e) => e.name === name)!;
    return {
        entity,
        columns: entity.columnIds.map((id) => design.columns[id]),
        keys: entity.keyIds.map((id) => design.keys[id]),
        rules: entity.ruleIds.map((id) => design.rules[id]),
    };
};
const nameOf = (design: Design, id: string) => design.columns[id].name;

describe('PostgreSQL: index direction, predicates, domains, generated columns', () => {
    for (const [label, json] of [
        ['18', pg18],
        ['16', pg16],
    ] as const) {
        it(`keeps them from a live PostgreSQL ${label} result`, () => {
            const { design } = load(json, 'postgresql');
            const t = table(design, 'customers');
            const key = (n: string) => t.keys.find((k) => k.label === n)!;

            expect(
                key('customers_score_desc').members.map((m) =>
                    nameOf(design, m)
                )
            ).toEqual(['score', 'id']);
            expect(
                key('customers_score_desc').descending?.map((m) =>
                    nameOf(design, m)
                )
            ).toEqual(['score']);
            expect(key('customers_score_desc').where).toBeUndefined();
            expect(key('customers_live').where).toBe('(deleted_at IS NULL)');
            expect(key('customers_email_live')).toMatchObject({
                distinct: true,
                where: '(deleted_at IS NULL)',
            });
            // a partial unique index does not make its column unique
            expect(t.columns.find((c) => c.name === 'email')!.unique).toBe(
                false
            );

            const email = t.columns.find((c) => c.name === 'email')!;
            expect(email).toMatchObject({
                type: { name: 'varchar' },
                length: 120,
                domain: 'email',
            });
            expect(t.columns.find((c) => c.name === 'qty')).toMatchObject({
                type: { name: 'integer' },
                domain: 'pos_int',
            });
            const full = t.columns.find((c) => c.name === 'full_name')!;
            expect(full.generated).toEqual({
                expression: "((first_name || ' '::text) || last_name)",
                stored: true,
            });
            expect(full.default).toBeUndefined();

            expect(t.rules.map((r) => r.expression).sort()).toEqual([
                '(length(first_name) < 100)',
                '(score >= 0)',
            ]);
            expect(
                listOf(design.userTypes)
                    .map((u) => u.kind)
                    .sort()
            ).toEqual(['composite', 'enum']);
        });
    }

    it('writes DESC, WHERE and GENERATED back as PostgreSQL', () => {
        const { design } = load(pg18, 'postgresql');
        const sql = writePostgres(design);
        expect(sql).toContain('("score" DESC, "id")');
        expect(sql).toMatch(
            /CREATE INDEX "[^"]*customers_live" ON "sales"."customers" \("last_name"\) WHERE \(deleted_at IS NULL\);/
        );
        expect(sql).toMatch(
            /CREATE UNIQUE INDEX "[^"]*customers_email_live" ON "sales"."customers" \("email"\) WHERE \(deleted_at IS NULL\);/
        );
        expect(sql).toContain(
            `"full_name" text GENERATED ALWAYS AS (((first_name || ' '::text) || last_name)) STORED`
        );
        expect(sql).not.toMatch(/"full_name"[^\n]*DEFAULT/);
    });

    it('writes the same index and generated column for SQLite', () => {
        const { design } = load(pg18, 'postgresql');
        const sql = writeSqlite({ ...design, databaseType: 'sqlite' });
        expect(sql).toContain('("score" DESC, "id")');
        expect(sql).toContain('WHERE (deleted_at IS NULL);');
        expect(sql).toContain('GENERATED ALWAYS AS (((first_name');
        expect(sql).toContain(') STORED');
    });
});

describe('MySQL and MariaDB: index direction, generated columns, checks', () => {
    for (const [label, json, type] of [
        ['MySQL 8.4', mysql, 'mysql'],
        ['MariaDB 11', mariadb, 'mariadb'],
    ] as const) {
        it(`keeps them from a live ${label} result`, () => {
            const { design } = load(json, type);
            const t = table(design, 'customers');
            const key = t.keys.find((k) => k.label === 'customers_score_desc')!;
            expect(key.descending?.map((m) => nameOf(design, m))).toEqual([
                'score',
            ]);
            expect(key.where).toBeUndefined();
            expect(
                t.columns.find((c) => c.name === 'full_name')!.generated
            ).toMatchObject({ stored: true });
            expect(
                t.columns.find((c) => c.name === 'initials')!.generated
            ).toMatchObject({ stored: false });
            expect(t.rules).toHaveLength(2);
        });
    }

    it('writes DESC and GENERATED ... STORED|VIRTUAL back as MySQL', () => {
        const { design } = load(mysql, 'mysql');
        const sql = writeMysql(design);
        expect(sql).toContain('(`score` DESC, `id`)');
        expect(sql).toMatch(
            /`full_name` VARCHAR\(101\) GENERATED ALWAYS AS \(concat\(`first_name`,' ',`last_name`\)\) STORED/
        );
        expect(sql).toMatch(
            /`initials` VARCHAR\(3\) GENERATED ALWAYS AS \(.*\) VIRTUAL/
        );
    });
});

describe('older results and files keep working', () => {
    it('a result without domain, generated or where loads as before', () => {
        const old = JSON.parse(JSON.stringify(pg18)) as typeof pg18;
        for (const c of old.columns) {
            delete (c as Record<string, unknown>).domain;
            delete (c as Record<string, unknown>).generated;
        }
        for (const i of old.indexes)
            delete (i as Record<string, unknown>).where;
        const { design } = load(old, 'postgresql');
        const t = table(design, 'customers');
        expect(t.columns.every((c) => !c.domain && !c.generated)).toBe(true);
        expect(t.keys.every((k) => !k.where)).toBe(true);
        // direction is read from the old field too
        expect(t.keys.some((k) => k.descending?.length)).toBe(true);
    });

    it('an uppercase direction (the server before) still means descending', () => {
        const meta = JSON.parse(JSON.stringify(pg18)) as typeof pg18;
        for (const i of meta.indexes) i.direction = i.direction.toUpperCase();
        const t = table(load(meta, 'postgresql').design, 'customers');
        expect(t.keys.some((k) => k.descending?.length)).toBe(true);
    });
});

describe('the saved format', () => {
    it('round-trips the new keys and passes the file check', () => {
        const { design } = load(pg18, 'postgresql');
        const wire = serialise(design);
        expect(validateDiagramFile(wire)).toEqual([]);
        const text = JSON.stringify(wire);
        expect(text).toContain('"descendingFieldIds"');
        expect(text).toContain('"where":"(deleted_at IS NULL)"');
        expect(text).toContain('"generatedStored":true');
        expect(text).toContain('"domain":"pos_int"');

        const back = parse(JSON.parse(text), { now: 1, random: rng() });
        expect(back.warnings).toEqual([]);
        const t = table(back.design, 'customers');
        const key = t.keys.find((k) => k.label === 'customers_score_desc')!;
        expect(key.descending).toHaveLength(1);
        expect(nameOf(back.design, key.descending![0])).toBe('score');
        expect(t.keys.find((k) => k.label === 'customers_live')!.where).toBe(
            '(deleted_at IS NULL)'
        );
        expect(
            t.columns.find((c) => c.name === 'full_name')!.generated
        ).toEqual({
            expression: "((first_name || ' '::text) || last_name)",
            stored: true,
        });
        expect(t.columns.find((c) => c.name === 'qty')!.domain).toBe('pos_int');
        // and writes them again byte for byte
        expect(JSON.stringify(serialise(back.design))).toBe(
            JSON.stringify(serialise(design))
        );
    });

    it('a file written before has none of the new keys and nothing changes', () => {
        const wire = serialise(load(mysql, 'mysql').design) as {
            tables: {
                fields: Record<string, unknown>[];
                indexes: Record<string, unknown>[];
            }[];
        };
        for (const t of wire.tables) {
            for (const f of t.fields) {
                delete f.generatedExpression;
                delete f.generatedStored;
                delete f.domain;
            }
            for (const i of t.indexes) {
                delete i.descendingFieldIds;
                delete i.where;
            }
        }
        expect(validateDiagramFile(wire)).toEqual([]);
        const back = parse(wire, { now: 1, random: rng() });
        expect(back.warnings).toEqual([]);
        const t = table(back.design, 'customers');
        expect(t.columns.every((c) => !c.generated && !c.domain)).toBe(true);
        expect(t.keys.every((k) => !k.descending && !k.where)).toBe(true);
        expect(t.keys).toHaveLength(2);
    });

    it('unknown keys on an index or column are still kept', () => {
        const wire = serialise(load(pg18, 'postgresql').design) as {
            tables: { fields: object[]; indexes: object[] }[];
        };
        (wire.tables[0].indexes[0] as Record<string, unknown>).futureKey = 7;
        (wire.tables[0].fields[0] as Record<string, unknown>).futureKey = 8;
        const back = serialise(
            parse(wire, { now: 1, random: rng() }).design
        ) as typeof wire;
        expect(
            (back.tables[0].indexes[0] as Record<string, unknown>).futureKey
        ).toBe(7);
        expect(
            (back.tables[0].fields[0] as Record<string, unknown>).futureKey
        ).toBe(8);
    });

    it('DBML export still works (DBML has no syntax for DESC, WHERE or generated columns)', () => {
        const { design } = load(pg18, 'postgresql');
        const out = exportDbml(design);
        expect(out.text).toContain('customers_live');
        expect(out.text).not.toContain('deleted_at IS NULL');
    });
});

describe('conversion between databases', () => {
    it('keeps DESC and says what it leaves out (partial predicate, computed column)', () => {
        const { design } = load(pg18, 'postgresql');
        const out = convertDesign(
            design,
            dialectFor('postgresql'),
            dialectFor('mysql')
        );
        expect(out.text).toContain('`score` DESC');
        expect(out.text).toMatch(
            /customers_live: partial index created without its WHERE/
        );
        expect(out.text).toMatch(
            /customers\.full_name: computed column created as an ordinary column/
        );
        expect(out.text).not.toContain('deleted_at IS NULL)');
    });
});
