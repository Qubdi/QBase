import { describe, expect, it } from 'vitest';
import {
    applyOk,
    blank,
    looksLikeGeneratedId,
    NOW,
    rng,
    withTables,
} from '../testing/helpers';
import { editionFits, traitsOf } from './database';
import {
    createColumn,
    createDesign,
    createEntityParts,
    createKey,
    createLink,
    createMemo,
    createRegion,
    createRule,
    createUserType,
    schemaForNewEntity,
} from './defaults';
import { TABLE_COLOR, TABLE_WIDTH, VIEW_COLOR } from './entity';
import { idFromSeed, newDesignId, newId, seededRandom } from './ids';
import { regionMembership } from './region-membership';
import {
    isUnrestricted,
    isVisible,
    schemaIdOf,
    tidyFilter,
} from './visibility-filter';
import { arrayApplies, sizeSuffix, typeLabel } from './type-suffix';
import { parseTypeDeclaration } from './type-declaration';
import { typeRefOfUserType } from './user-type';
import { listOf } from './collection';
import { syncPrimaryKey } from './primary-key';
import { partsOf } from './lookup';

describe('DAT-022 a blank diagram', () => {
    it('has every list empty and the dates set', () => {
        const d = createDesign({
            name: '  Shop ',
            databaseType: 'mysql',
            now: NOW,
        });
        expect(d.name).toBe('Shop');
        expect(d.entities.order).toEqual([]);
        expect(d.links.order).toEqual([]);
        expect(d.userTypes.order).toEqual([]);
        expect(d.regions.order).toEqual([]);
        expect(d.memos.order).toEqual([]);
        expect(d.dependencies).toEqual([]);
        expect(d.createdAt).toBe(NOW);
        expect(d.updatedAt).toBe(NOW);
    });

    it('uses the localized default name when the name is blank', () => {
        const d = createDesign({
            name: '   ',
            defaultName: 'Untitled diagram',
            databaseType: 'mysql',
        });
        expect(d.name).toBe('Untitled diagram');
    });
});

describe('DAT-021 editions', () => {
    it('only fit their own database type', () => {
        expect(editionFits('postgresql', 'supabase')).toBe(true);
        expect(editionFits('postgresql', 'timescale')).toBe(true);
        expect(editionFits('mysql', 'mysql_5_7')).toBe(true);
        expect(editionFits('sql_server', 'sql_server_2016_and_below')).toBe(
            true
        );
        expect(editionFits('sqlite', 'cloudflare_d1')).toBe(true);
        expect(editionFits('mysql', 'supabase')).toBe(false);
        expect(editionFits('oracle', 'cloudflare_d1')).toBe(false);
    });

    it('a design keeps a fitting edition and drops another', () => {
        expect(
            createDesign({
                name: 'a',
                databaseType: 'sqlite',
                databaseEdition: 'cloudflare_d1',
            }).databaseEdition
        ).toBe('cloudflare_d1');
        expect(
            createDesign({
                name: 'a',
                databaseType: 'sqlite',
                databaseEdition: 'supabase',
            }).databaseEdition
        ).toBeUndefined();
    });
});

describe('DAT-026 / DAT-027 / DAT-028 / DAT-029 a new table', () => {
    it('is table_N with an id primary-key column and its primary-key index', () => {
        const d = withTables(['a', 'b']);
        const parts = createEntityParts(d, { now: NOW, random: rng() });
        expect(parts.entity.name).toBe('table_3');
        expect(parts.columns).toHaveLength(1);
        expect(parts.columns[0]).toMatchObject({
            name: 'id',
            primaryKey: true,
            unique: true,
            nullable: false,
            type: { id: 'bigint', name: 'bigint' },
        });
        expect(parts.keys).toHaveLength(1);
        expect(parts.keys[0]).toMatchObject({
            label: '',
            distinct: true,
            pk: true,
            members: [parts.columns[0].id],
        });
        expect(parts.entity.columnIds).toEqual([parts.columns[0].id]);
        expect(parts.entity.keyIds).toEqual([parts.keys[0].id]);
    });

    it('a view is view_N, counted apart from tables, with no index', () => {
        const d = withTables(['a', 'b']);
        const view = createEntityParts(d, { kind: 'view', now: NOW });
        expect(view.entity.name).toBe('view_1');
        expect(view.keys).toEqual([]);
        expect(view.entity.color).toBe(VIEW_COLOR);
        const withView = applyOk(d, {
            type: 'entity.insert',
            parts: view,
        }).design;
        expect(createEntityParts(withView, {}).entity.name).toBe('table_3');
        expect(createEntityParts(withView, { kind: 'view' }).entity.name).toBe(
            'view_2'
        );
    });

    it('DAT-027 default colours', () => {
        expect(TABLE_COLOR).toBe('#8eb7ff');
        expect(VIEW_COLOR).toBe('#b0b0b0');
        expect(createEntityParts(blank(), {}).entity.color).toBe('#8eb7ff');
    });

    it.each([
        ['postgresql', 'public'],
        ['sql_server', 'dbo'],
    ] as const)('DAT-028 %s tables start in schema %s', (type, schema) => {
        expect(createEntityParts(blank(type), {}).entity.schema).toBe(schema);
    });

    it.each(['mysql', 'mariadb', 'sqlite', 'oracle'] as const)(
        'DAT-028 %s tables start without a schema',
        (type) => {
            expect(
                createEntityParts(blank(type), {}).entity.schema
            ).toBeUndefined();
        }
    );

    it('DAT-028 with visible schemas the default is used if visible, else the first', () => {
        expect(schemaForNewEntity('postgresql', ['sales', 'public'])).toBe(
            'public'
        );
        expect(schemaForNewEntity('postgresql', ['sales', 'hr'])).toBe('sales');
        expect(schemaForNewEntity('postgresql', [])).toBe('public');
        expect(schemaForNewEntity('mysql', ['x'])).toBeUndefined();
        expect(schemaForNewEntity('oracle', [])).toBeUndefined();
    });

    it('DAT-029 width limits', () => {
        expect(TABLE_WIDTH).toEqual({
            min: 224,
            mid: 337,
            max: 450,
            default: 224,
        });
    });
});

describe('DAT-030 / DAT-031 expanded and parent area', () => {
    it('are plain properties of a table, kept by commands', () => {
        const d = withTables(['a']);
        const id = d.entities.order[0];
        const next = applyOk(d, {
            type: 'entity.update',
            id,
            patch: { expanded: true, regionId: 'r' },
        }).design;
        expect(next.entities.byId[id]).toMatchObject({
            expanded: true,
            regionId: 'r',
        });
    });

    it('DAT-031 a table fully inside a region belongs to it; the top-most region wins', () => {
        let d = withTables(['a', 'b']);
        const [a, b] = d.entities.order;
        d = applyOk(d, {
            type: 'entity.move',
            moves: [
                { id: a, x: 110, y: 110 },
                { id: b, x: 2000, y: 2000 },
            ],
        }).design;
        const r1 = createRegion(d, {
            box: { x: 100, y: 100, width: 600, height: 600 },
            random: rng(1),
        });
        const r2 = createRegion(d, {
            box: { x: 100, y: 100, width: 600, height: 600 },
            random: rng(2),
        });
        d = applyOk(d, {
            type: 'item.insert',
            collection: 'regions',
            item: r1,
        }).design;
        d = applyOk(d, {
            type: 'item.insert',
            collection: 'regions',
            item: r2,
        }).design;
        const m = regionMembership(d);
        expect(m.get(a)).toBe(r2.id);
        expect(m.get(b)).toBeUndefined();
    });

    it('DAT-031 a table that only overlaps a region is not a member', () => {
        let d = withTables(['a']);
        const a = d.entities.order[0];
        d = applyOk(d, {
            type: 'entity.move',
            moves: [{ id: a, x: 90, y: 110 }],
        }).design;
        d = applyOk(d, {
            type: 'item.insert',
            collection: 'regions',
            item: createRegion(d, {
                box: { x: 100, y: 100, width: 600, height: 600 },
                random: rng(1),
            }),
        }).design;
        expect(regionMembership(d).get(a)).toBeUndefined();
    });
});

describe('DAT-035 / DAT-036 a new field', () => {
    it('is field_N, nullable, not unique, not a key, default type', () => {
        const c = createColumn(blank(), 2, { now: NOW, random: rng() });
        expect(c).toMatchObject({
            name: 'field_3',
            primaryKey: false,
            unique: false,
            nullable: true,
            type: { id: 'bigint', name: 'bigint' },
        });
    });

    it.each([
        ['sqlite', 'integer'],
        ['oracle', 'number'],
        ['postgresql', 'bigint'],
        ['mysql', 'bigint'],
        ['sql_server', 'bigint'],
        ['mariadb', 'bigint'],
    ] as const)('DAT-036 %s uses %s', (db, type) => {
        expect(traitsOf(db).defaultColumnType).toBe(type);
        expect(createColumn({ databaseType: db }, 0).type).toEqual({
            id: type,
            name: type,
        });
    });
});

describe('DAT-037 / DAT-038 array flag and type suffix', () => {
    it('DAT-038 length, then precision and scale, then precision', () => {
        expect(sizeSuffix({ length: 255 })).toBe('(255)');
        expect(sizeSuffix({ length: 'max' })).toBe('(max)');
        expect(sizeSuffix({ precision: 10, scale: 2 })).toBe('(10, 2)');
        expect(sizeSuffix({ precision: 10 })).toBe('(10)');
        expect(sizeSuffix({ precision: 10, scale: 0 })).toBe('(10)');
        expect(sizeSuffix({ length: 5, precision: 10, scale: 2 })).toBe('(5)');
        expect(sizeSuffix({})).toBe('');
    });

    it('DAT-037 the array flag only counts for databases and types that allow it', () => {
        expect(arrayApplies({ isArray: true }, 'postgresql')).toBe(true);
        expect(arrayApplies({ isArray: true }, 'mysql')).toBe(false);
        expect(arrayApplies({ isArray: true }, 'postgresql', false)).toBe(
            false
        );
        expect(arrayApplies({}, 'postgresql')).toBe(false);
        const col = { type: { id: 'text', name: 'text' }, isArray: true };
        expect(typeLabel(col, 'postgresql')).toBe('text[]');
        expect(typeLabel(col, 'sqlite')).toBe('text');
    });

    it('EDT-121 a typed declaration fills size, precision, scale and array', () => {
        expect(parseTypeDeclaration('varchar(255)')).toEqual({
            name: 'varchar',
            length: 255,
        });
        expect(parseTypeDeclaration('numeric(10,2)')).toEqual({
            name: 'numeric',
            precision: 10,
            scale: 2,
        });
        expect(parseTypeDeclaration('decimal(8)')).toEqual({
            name: 'decimal',
            precision: 8,
        });
        expect(parseTypeDeclaration('varchar(max)')).toEqual({
            name: 'varchar',
            length: 'max',
        });
        expect(parseTypeDeclaration('integer[]')).toEqual({
            name: 'integer',
            isArray: true,
        });
        expect(parseTypeDeclaration('double precision')).toEqual({
            name: 'double precision',
        });
        expect(parseTypeDeclaration('varchar(x)')).toBeUndefined();
        expect(parseTypeDeclaration('(3)')).toBeUndefined();
    });
});

describe('DAT-039 a custom type used as a column type', () => {
    it('stores its name as both id and name', () => {
        const type = createUserType(blank(), { name: 'mood', random: rng() });
        expect(typeRefOfUserType(type)).toEqual({ id: 'mood', name: 'mood' });
    });
});

describe('DAT-042 the primary-key index lists exactly the primary-key columns', () => {
    const base = () => {
        const d = withTables(['t']);
        return partsOf(d, d.entities.byId[d.entities.order[0]]);
    };

    it('follows the columns, in column order, and comes first', () => {
        const parts = base();
        const second = createColumn(blank(), 1, {
            name: 'second',
            primaryKey: true,
            nullable: false,
            now: NOW,
            random: rng(2),
        });
        const extra = createKey(1, {
            label: 'x',
            members: [parts.columns[0].id],
            now: NOW,
            random: rng(3),
        });
        const next = syncPrimaryKey({
            entity: {
                ...parts.entity,
                columnIds: [...parts.entity.columnIds, second.id],
                keyIds: [extra.id, ...parts.entity.keyIds],
            },
            columns: [...parts.columns, second],
            keys: [extra, ...parts.keys],
            rules: [],
        });
        expect(next.keys[0].pk).toBe(true);
        expect(next.keys[0].members).toEqual([parts.columns[0].id, second.id]);
        expect(next.keys[0].label).toBe('');
        expect(next.entity.keyIds[0]).toBe(next.keys[0].id);
    });

    it('is removed when no column is a primary key, and made when one appears', () => {
        const parts = base();
        const none = syncPrimaryKey({
            ...parts,
            columns: parts.columns.map((c) => ({ ...c, primaryKey: false })),
        });
        expect(none.keys).toEqual([]);
        expect(none.entity.keyIds).toEqual([]);
        const again = syncPrimaryKey({
            ...none,
            columns: none.columns.map((c) => ({ ...c, primaryKey: true })),
        });
        expect(again.keys).toHaveLength(1);
        expect(again.keys[0]).toMatchObject({
            pk: true,
            distinct: true,
            label: '',
        });
        // the same input always gives the same id
        const twice = syncPrimaryKey({
            ...none,
            columns: none.columns.map((c) => ({ ...c, primaryKey: true })),
        });
        expect(twice.keys[0].id).toBe(again.keys[0].id);
        expect(looksLikeGeneratedId(again.keys[0].id)).toBe(true);
    });

    it('DAT-042 a primary-key column that is nullable is made not null', () => {
        const parts = base();
        const next = syncPrimaryKey({
            ...parts,
            columns: parts.columns.map((c) => ({ ...c, nullable: true })),
        });
        expect(next.columns[0].nullable).toBe(false);
    });

    it('leaves a view alone', () => {
        const d = blank();
        const view = createEntityParts(d, { kind: 'view', now: NOW });
        expect(syncPrimaryKey(view)).toBe(view);
    });

    it('returns the same value when nothing is out of step', () => {
        const parts = base();
        expect(syncPrimaryKey(parts)).toBe(parts);
    });
});

describe('DAT-043 / DAT-049 / DAT-051 / DAT-054 / DAT-055 / DAT-056 new records', () => {
    it('DAT-043 a new index', () => {
        expect(createKey(0, { now: NOW })).toMatchObject({
            label: 'index_1',
            distinct: false,
            members: [],
        });
        expect(createKey(4, {}).label).toBe('index_5');
    });

    it('DAT-049 a new link is one to one and named after table and column', () => {
        const d = withTables(['customers', 'orders']);
        const [a, b] = d.entities.order;
        const link = createLink(
            d,
            { entityId: a, columnId: d.entities.byId[a].columnIds[0] },
            { entityId: b, columnId: d.entities.byId[b].columnIds[0] },
            { now: NOW }
        );
        expect(link.name).toBe('customers_id_fk');
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'one',
        ]);
        expect(link.sourceSchema).toBe('public');
        expect(link.targetSchema).toBe('public');
    });

    it('DAT-051 a new check is empty', () => {
        expect(createRule({ now: NOW }).expression).toBe('');
    });

    it('DAT-054 a new custom type is an enum named type_N', () => {
        const d = blank();
        expect(createUserType(d)).toMatchObject({
            name: 'type_1',
            kind: 'enum',
            values: [],
        });
    });

    it('DAT-055 a new area', () => {
        const d = blank();
        const region = createRegion(d, { random: rng(5) });
        expect(region).toMatchObject({
            label: 'Area 1',
            box: { x: 0, y: 0, width: 300, height: 200 },
        });
        expect(region.tint).toMatch(/^#[0-9a-f]{6}$/);
        const colours = new Set(
            Array.from(
                { length: 40 },
                (_, i) => createRegion(d, { random: rng(i + 1) }).tint
            )
        );
        expect(colours.size).toBeGreaterThan(1);
    });

    it('DAT-056 a new note', () => {
        expect(createMemo()).toMatchObject({
            body: '',
            box: { x: 0, y: 0, width: 200, height: 150 },
            tint: '#ffe374',
        });
    });
});

describe('DAT-058 the visibility filter', () => {
    const tables = [
        { id: 'a', schema: 'public' },
        { id: 'b', schema: 'public' },
        { id: 'c', schema: 'Sales Team' },
        { id: 'd', schema: 'sales team' },
        { id: 'e', schema: undefined },
    ];

    it('a schema id is trimmed, lower-cased, spaces turned to underscores', () => {
        expect(schemaIdOf('  Sales Team ')).toBe('sales_team');
    });

    it('no keys means everything is shown', () => {
        expect(tables.every((t) => isVisible({}, t, 'public'))).toBe(true);
    });

    it('union logic: a listed id or a listed schema', () => {
        const filter = { schemaIds: ['sales_team'], tableIds: ['a'] };
        expect(tables.map((t) => isVisible(filter, t, 'public'))).toEqual([
            true,
            false,
            true,
            true,
            false,
        ]);
        // a table with no schema uses the database default
        expect(
            isVisible({ schemaIds: ['public'] }, { id: 'e' }, 'public')
        ).toBe(true);
        expect(
            isVisible({ schemaIds: ['public'] }, { id: 'e' }, undefined)
        ).toBe(false);
    });

    it('an empty table list with no schemas shows nothing', () => {
        expect(
            tables.some((t) => isVisible({ tableIds: [] }, t, 'public'))
        ).toBe(false);
    });

    it('tidy drops tables whose schema is already listed', () => {
        expect(
            tidyFilter(
                { schemaIds: ['public'], tableIds: ['a', 'c'] },
                tables,
                'public'
            )
        ).toEqual({ schemaIds: ['public'], tableIds: ['c'] });
    });

    it('tidy moves a schema whose tables are all listed into the schema list', () => {
        expect(
            tidyFilter({ tableIds: ['a', 'b', 'e'] }, tables, 'public')
        ).toEqual({ schemaIds: ['public'] });
    });

    it('tidy removes both keys when that shows everything', () => {
        expect(
            tidyFilter(
                { schemaIds: ['public', 'sales_team'], tableIds: ['e'] },
                tables,
                'public'
            )
        ).toEqual({});
        expect(
            tidyFilter(
                { tableIds: ['a', 'b', 'c', 'd', 'e'] },
                tables,
                'public'
            )
        ).toEqual({});
    });

    it('tidy keeps "nothing shown" as it is', () => {
        expect(tidyFilter({ tableIds: [] }, tables, 'public')).toEqual({
            tableIds: [],
        });
    });

    it('works for databases without schemas', () => {
        const plain = [{ id: 'a' }, { id: 'b' }];
        expect(tidyFilter({ tableIds: ['a'] }, plain)).toEqual({
            tableIds: ['a'],
        });
        expect(tidyFilter({ tableIds: ['a', 'b'] }, plain)).toEqual({});
    });

    it('DAT-011 with no saved filter everything is shown, whatever the schemas', () => {
        expect(isUnrestricted({})).toBe(true);
        expect(isUnrestricted(undefined)).toBe(true);
        expect(isUnrestricted({ tableIds: [] })).toBe(false);
        expect(isUnrestricted({ schemaIds: ['public'] })).toBe(false);
    });
});

describe('DAT-059 / DAT-060 ids', () => {
    it('DAT-059 a child id is 25 lower-case letters and digits', () => {
        for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[0-9a-z]{25}$/);
        expect(new Set(Array.from({ length: 200 }, () => newId())).size).toBe(
            200
        );
    });

    it('DAT-059 a seeded source repeats; a seed string gives a stable id', () => {
        expect(newId(seededRandom(5))).toBe(newId(seededRandom(5)));
        expect(idFromSeed('x')).toBe(idFromSeed('x'));
        expect(idFromSeed('x')).not.toBe(idFromSeed('y'));
        expect(idFromSeed('x')).toMatch(/^[0-9a-z]{25}$/);
    });

    it('DAT-060 a new diagram id has the same shape as any other id, no browser prefix', () => {
        expect(newDesignId()).toMatch(/^[0-9a-z]{25}$/);
        expect(listOf(blank().entities)).toEqual([]);
    });
});

describe('parseTypeDeclaration on long runs of spaces', () => {
    it('answers in milliseconds, not seconds (no catastrophic backtracking)', () => {
        for (const text of [
            `a${' '.repeat(5000)}!`,
            `varchar${' '.repeat(5000)}(`,
            `varchar(1)${' '.repeat(5000)}x`,
            `a b${' '.repeat(5000)}[`,
        ]) {
            const started = performance.now();
            expect(parseTypeDeclaration(text)).toBeUndefined();
            expect(performance.now() - started).toBeLessThan(200);
        }
    });

    it('still reads names with spaces, lengths and brackets', () => {
        expect(parseTypeDeclaration('  character varying ( 10 ) [] ')).toEqual({
            name: 'character varying',
            length: 10,
            isArray: true,
        });
        expect(parseTypeDeclaration('decimal(10, 2)')).toEqual({
            name: 'decimal',
            precision: 10,
            scale: 2,
        });
    });
});
