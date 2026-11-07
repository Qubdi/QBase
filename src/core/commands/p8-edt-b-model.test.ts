import { describe, expect, it } from 'vitest';
import { DATABASE_TYPES, traitsOf } from '@/core/model/database';
import type { DatabaseType } from '@/core/model/database';
import { createEntityParts, schemaForNewEntity } from '@/core/model/defaults';
import { dialectFor } from '@/dialects/registry';
import { mergeImported } from '@/features/import/merge-into-design';
import { typeOptions } from '@/features/tables/fields/type-options';
import { applyOk, blank, NOW, rng, withTables } from '@/core/testing/helpers';
import { planAddRule } from './plan-column';

const WRITABLE: DatabaseType[] = [
    'generic',
    'postgresql',
    'mysql',
    'sql_server',
    'mariadb',
    'sqlite',
    'cockroachdb',
];

describe('EDT-149 check expressions are not validated', () => {
    it('accepts any text, including a broken expression', () => {
        let d = withTables(['t']);
        const id = d.entities.order[0];
        d = applyOk(d, planAddRule(id, { now: NOW, random: rng(3) })).design;
        const rule = d.rules[d.entities.byId[id].ruleIds[0]];
        for (const expression of ['((', 'price > 0', '   ', "name = 'x"]) {
            d = applyOk(d, {
                type: 'part.update',
                entityId: id,
                part: 'rules',
                id: rule.id,
                patch: { expression },
            }).design;
            expect(d.rules[rule.id].expression).toBe(expression);
        }
    });
});

describe('EDT-275 schema pickers only where the database has schemas', () => {
    it('PostgreSQL, CockroachDB, SQL Server, ClickHouse and Oracle only', () => {
        const withSchemas = DATABASE_TYPES.filter(
            (t) => traitsOf(t).hasSchemas
        );
        expect([...withSchemas].sort()).toEqual(
            [
                'clickhouse',
                'cockroachdb',
                'oracle',
                'postgresql',
                'sql_server',
            ].sort()
        );
    });

    it('the dialect capabilities agree for every writable database', () => {
        for (const type of WRITABLE)
            expect(dialectFor(type).capabilities.schemas).toBe(
                traitsOf(type).hasSchemas
            );
    });

    it('a table in a database without schemas never gets one', () => {
        for (const type of ['mysql', 'mariadb', 'sqlite', 'generic'] as const) {
            const parts = createEntityParts(blank(type), { schema: 'x' });
            expect(parts.entity.schema).toBeUndefined();
        }
    });
});

describe('EDT-143 / EDT-276 per-database features', () => {
    it('arrays only on PostgreSQL and CockroachDB', () => {
        for (const type of DATABASE_TYPES)
            expect(traitsOf(type).hasArrays).toBe(
                type === 'postgresql' || type === 'cockroachdb'
            );
        for (const type of WRITABLE)
            expect(dialectFor(type).capabilities.arrayColumns).toBe(
                traitsOf(type).hasArrays
            );
    });

    it('custom types only on PostgreSQL', () => {
        for (const type of DATABASE_TYPES)
            expect(traitsOf(type).hasUserTypes).toBe(type === 'postgresql');
    });

    it('index types only on PostgreSQL and CockroachDB', () => {
        for (const type of DATABASE_TYPES)
            expect(traitsOf(type).hasIndexMethods).toBe(
                type === 'postgresql' || type === 'cockroachdb'
            );
        for (const type of WRITABLE) {
            const methods = dialectFor(type).capabilities.indexMethods;
            if (traitsOf(type).hasIndexMethods)
                expect(methods).toEqual(
                    expect.arrayContaining(['btree', 'hash', 'gin'])
                );
            else expect(methods).toEqual([]);
        }
    });
});

describe('EDT-277 a new table takes the default schema', () => {
    it('public, dbo, default; none where schemas are not used', () => {
        expect(schemaForNewEntity('postgresql')).toBe('public');
        expect(schemaForNewEntity('cockroachdb')).toBe('public');
        expect(schemaForNewEntity('sql_server')).toBe('dbo');
        expect(schemaForNewEntity('clickhouse')).toBe('default');
        expect(schemaForNewEntity('mysql')).toBeUndefined();
        expect(schemaForNewEntity('sqlite')).toBeUndefined();
    });

    it('createEntityParts writes it on the table', () => {
        expect(createEntityParts(blank('sql_server')).entity.schema).toBe(
            'dbo'
        );
        expect(createEntityParts(blank('postgresql')).entity.schema).toBe(
            'public'
        );
        expect(createEntityParts(blank('mysql')).entity.schema).toBeUndefined();
    });
});

describe('EDT-278 each database offers its own type list, common types first', () => {
    it('lists differ per database and hold the default type', () => {
        for (const type of WRITABLE) {
            const { standard } = typeOptions(type);
            const names = standard.map((o) => o.ref.name);
            expect(names.length).toBeGreaterThan(3);
            expect(new Set(names).size).toBe(names.length);
            expect(names).toEqual(
                expect.arrayContaining([dialectFor(type).defaultType])
            );
        }
        const pg = typeOptions('postgresql').standard.map((o) => o.ref.name);
        const my = typeOptions('mysql').standard.map((o) => o.ref.name);
        expect(pg).toContain('jsonb');
        expect(my).not.toContain('jsonb');
        expect(my).toContain('tinyint');
        expect(pg).not.toContain('tinyint');
    });

    it('common types come first for the databases that have a short list', () => {
        const first = (t: DatabaseType) =>
            typeOptions(t)
                .standard.slice(0, 2)
                .map((o) => o.ref.name);
        expect(first('postgresql')).toEqual(['integer', 'bigint']);
        expect(first('mysql')).toEqual(['int', 'bigint']);
        expect(first('sqlite')).toEqual(['integer', 'text']);
        expect(first('sql_server')).toEqual(['int', 'bigint']);
    });
});

describe('EDT-249 imported tables land 150 px right of the right-most table', () => {
    it('moves the imported group so its left edge is 150 px past the right edge', () => {
        let current = withTables(['a', 'b']);
        const [a, b] = current.entities.order;
        current = applyOk(current, {
            type: 'entity.update',
            id: a,
            patch: { x: 100, y: 0 },
        }).design;
        current = applyOk(current, {
            type: 'entity.update',
            id: b,
            patch: { x: 600, y: 40, width: 300 },
        }).design;
        let imported = blank('postgresql');
        const random = rng(5);
        for (const name of ['c', 'd']) {
            const parts = createEntityParts(imported, {
                name,
                now: NOW,
                random,
                x: name === 'c' ? 20 : 400,
            });
            imported = applyOk(imported, {
                type: 'entity.insert',
                parts,
            }).design;
        }
        const result = mergeImported(current, imported, NOW);
        const xs = imported.entities.order.map(
            (id) => result.design.entities.byId[id].x
        );
        expect(xs).toEqual([600 + 300 + 150, 600 + 300 + 150 + 380]);
        expect(result.addedEntities).toBe(2);
        expect(result.design.entities.order).toHaveLength(4);
    });
});
