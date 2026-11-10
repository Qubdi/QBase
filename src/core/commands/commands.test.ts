import type { Key } from '../model/key';
import { describe, expect, it } from 'vitest';
import { listOf } from '../model/collection';
import type { Design } from '../model/design';
import { partsOf } from '../model/lookup';
import {
    applyOk,
    blank,
    NOW,
    rng,
    sameButDate,
    withTables,
} from '../testing/helpers';
import { parse } from '../wire/parse';
import { shop } from '../wire/fixtures/shop';
import { apply } from './apply';
import type { Command } from './command';
import { coalesceKey } from './coalesce';
import {
    makeClip,
    planAddEntity,
    planChangeSchema,
    planDeleteEntities,
    planDuplicateEntity,
    planPaste,
} from './plan-entity';
import {
    canUseGin,
    planAddColumn,
    planAddKey,
    planAddRule,
    planChangeColumnType,
    planDeleteColumn,
    planSetKeyColumns,
    planUpdateColumn,
} from './plan-column';
import {
    planDeleteLink,
    planLink,
    planSetCardinality,
    planSwitchLink,
    typesCompatible,
} from './plan-link';
import {
    planAddMemo,
    planAddRegion,
    planAddUserType,
    planMoveRegion,
    planSetUserTypeKind,
} from './plan-visual';

const shopDesign = (): Design =>
    parse(shop, { now: NOW, random: rng() }).design;

/** apply, then undo, then redo: each state must come back exactly */
function checkUndo(design: Design, command: Command): Design {
    const first = applyOk(design, command);
    expect(first.design).not.toBe(design);
    const undone = applyOk(first.design, first.inverse);
    expect(sameButDate(undone.design, design)).toEqual(design);
    const redone = applyOk(undone.design, undone.inverse);
    expect(sameButDate(redone.design, first.design)).toEqual(first.design);
    return first.design;
}

describe('DAT-023 the updated date moves on every real change', () => {
    it('is set to now by an edit and left alone by a refused or empty one', () => {
        const d = withTables(['a']);
        const later = apply(
            d,
            { type: 'design.rename', name: 'Renamed' },
            { now: NOW + 5 }
        );
        expect(later.ok && later.design.updatedAt).toBe(NOW + 5);
        const same = apply(
            d,
            { type: 'design.rename', name: d.name },
            { now: NOW + 9 }
        );
        expect(same.ok && same.design).toBe(d);
        expect(same.ok && same.changed).toBe(false);
        const bad = apply(
            d,
            { type: 'entity.remove', id: 'nope' },
            { now: NOW + 9 }
        );
        expect(bad.ok).toBe(false);
    });
});

describe('EDT-014 / EDT-274 read-only and refused commands change nothing', () => {
    it('EDT-014 a read-only design refuses every command', () => {
        const d = withTables(['a']);
        const r = apply(
            d,
            { type: 'design.rename', name: 'x' },
            { readOnly: true }
        );
        expect(r).toMatchObject({ ok: false, reason: 'read-only' });
    });

    it('Oracle designs are edited like any other (EXP-008, restored)', () => {
        for (const type of ['oracle'] as const) {
            const d = blank(type);
            expect(
                apply(d, { type: 'design.rename', name: 'x' })
            ).toMatchObject({ ok: true });
        }
    });

    it('EDT-274 a broken command is refused and the design is untouched', () => {
        const d = shopDesign();
        const frozen = JSON.stringify(d);
        const cases: Command[] = [
            { type: 'entity.remove', id: 'missing' },
            { type: 'entity.update', id: 'missing', patch: { name: 'x' } },
            { type: 'entity.move', moves: [{ id: 'missing', x: 1, y: 1 }] },
            { type: 'entity.move', moves: [{ id: 't1', x: Number.NaN, y: 1 }] },
            { type: 'entity.reorder', ids: ['t1'] },
            {
                type: 'part.remove',
                entityId: 't1',
                part: 'columns',
                id: 'nope',
            },
            {
                type: 'part.update',
                entityId: 't1',
                part: 'keys',
                id: 'i2',
                patch: { members: ['f10'] },
            },
            {
                type: 'part.insert',
                entityId: 't3',
                part: 'keys',
                item: {
                    id: 'zz',
                    label: 'x',
                    distinct: false,
                    members: [],
                    madeAt: 1,
                },
            },
            {
                type: 'part.reorder',
                entityId: 't1',
                part: 'columns',
                ids: ['f1', 'f2'],
            },
            { type: 'item.remove', collection: 'regions', id: 'missing' },
            { type: 'item.reorder', collection: 'memos', ids: [] },
            {
                type: 'item.insert',
                collection: 'regions',
                item: {
                    id: 'a1',
                    label: 'dup',
                    tint: '#000',
                    box: { x: 0, y: 0, width: 1, height: 1 },
                },
            },
            {
                type: 'item.insert',
                collection: 'links',
                item: {
                    ...shop.relationships[0],
                    id: 'rr',
                    sourceEntityId: 'gone',
                    sourceColumnId: 'f1',
                    targetEntityId: 't2',
                    targetColumnId: 'f10',
                    sourceCardinality: 'one',
                    targetCardinality: 'many',
                    name: 'x',
                    createdAt: 1,
                },
            },
            {
                type: 'group',
                commands: [
                    { type: 'design.rename', name: 'Half done' },
                    { type: 'entity.remove', id: 'missing' },
                ],
            },
        ];
        for (const command of cases) {
            const r = apply(d, command, { now: NOW });
            expect(r.ok, JSON.stringify(command)).toBe(false);
        }
        expect(JSON.stringify(d)).toBe(frozen);
    });
});

describe('EDT-223 every edit type undoes and redoes exactly', () => {
    const base = shopDesign();
    const cases: [string, (d: Design) => Command][] = [
        ['diagram rename', () => ({ type: 'design.rename', name: 'Another' })],
        [
            'table add',
            (d) => planAddEntity(d, { x: 5, y: 6, now: NOW, random: rng(4) }),
        ],
        [
            'view add',
            (d) => planAddEntity(d, { kind: 'view', now: NOW, random: rng(4) }),
        ],
        [
            'table delete (with links and dependencies)',
            () => ({ type: 'entity.remove', id: 't2' }),
        ],
        [
            'table delete of the other end',
            () => ({ type: 'entity.remove', id: 't1' }),
        ],
        [
            'table rename',
            () => ({
                type: 'entity.update',
                id: 't1',
                patch: { name: 'clients' },
            }),
        ],
        [
            'table colour',
            () => ({
                type: 'entity.update',
                id: 't1',
                patch: { color: '#ff0000' },
            }),
        ],
        [
            'table comment',
            () => ({
                type: 'entity.update',
                id: 't1',
                patch: { comments: undefined },
            }),
        ],
        [
            'table width',
            () => ({ type: 'entity.update', id: 't1', patch: { width: 450 } }),
        ],
        [
            'table expanded',
            () => ({
                type: 'entity.update',
                id: 't1',
                patch: { expanded: false },
            }),
        ],
        ['table schema (links follow)', () => planChangeSchema('t1', 'sales')],
        [
            'table move',
            () => ({
                type: 'entity.move',
                moves: [
                    { id: 't1', x: 9, y: 9 },
                    { id: 't2', x: 99, y: 99 },
                ],
            }),
        ],
        [
            'table order',
            () => ({ type: 'entity.reorder', ids: ['t3', 't1', 't2'] }),
        ],
        [
            'field add',
            (d) => planAddColumn(d, 't1', { now: NOW, random: rng(5) })!,
        ],
        [
            'field delete (links and index entries follow)',
            () => planDeleteColumn('t2', 'f10'),
        ],
        ['field delete of a primary key', () => planDeleteColumn('t1', 'f1')],
        [
            'field edit',
            () => planUpdateColumn('t1', 'f2', { name: 'mail', length: 100 }),
        ],
        [
            'field order',
            () => ({
                type: 'part.reorder',
                entityId: 't1',
                part: 'columns',
                ids: ['f3', 'f2', 'f1'],
            }),
        ],
        [
            'primary key on',
            () => planUpdateColumn('t1', 'f2', { primaryKey: true }),
        ],
        [
            'primary key off',
            () => planUpdateColumn('t1', 'f1', { primaryKey: false }),
        ],
        [
            'index add',
            (d) => planAddKey(d, 't1', { now: NOW, random: rng(6) })!,
        ],
        ['index edit', (d) => planSetKeyColumns(d, 't1', 'i2', ['f2', 'f3'])!],
        [
            'index delete',
            () => ({
                type: 'part.remove',
                entityId: 't1',
                part: 'keys',
                id: 'i2',
            }),
        ],
        ['check add', () => planAddRule('t1', { now: NOW, random: rng(7) })],
        [
            'check edit',
            () => ({
                type: 'part.update',
                entityId: 't1',
                part: 'rules',
                id: 'c1',
                patch: { expression: 'x > 1' },
            }),
        ],
        [
            'check delete',
            () => ({
                type: 'part.remove',
                entityId: 't1',
                part: 'rules',
                id: 'c1',
            }),
        ],
        [
            'link add',
            (d) => {
                const plan = planLink(
                    d,
                    { entityId: 't2', columnId: 'f9' },
                    { entityId: 't1', columnId: 'f1' },
                    { now: NOW, random: rng(8) }
                );
                if (plan.kind !== 'ok') throw new Error(plan.kind);
                return plan.command;
            },
        ],
        [
            'link cardinality',
            (d) => planSetCardinality(d.links.byId.r1, 'one-to-one'),
        ],
        ['link switch', (d) => planSwitchLink(d.links.byId.r1)],
        ['link delete', () => planDeleteLink('r1')],
        ['custom type add', (d) => planAddUserType(d, { random: rng(9) })],
        [
            'custom type edit',
            () => ({
                type: 'item.update',
                collection: 'userTypes',
                id: 'ct1',
                patch: { values: ['x'] },
            }),
        ],
        ['custom type kind', () => planSetUserTypeKind('ct1', 'composite')],
        [
            'custom type delete',
            () => ({ type: 'item.remove', collection: 'userTypes', id: 'ct1' }),
        ],
        [
            'custom type order',
            () => ({
                type: 'item.reorder',
                collection: 'userTypes',
                ids: ['ct2', 'ct1'],
            }),
        ],
        ['area add', (d) => planAddRegion(d, { random: rng(10) })],
        [
            'area edit',
            () => ({
                type: 'item.update',
                collection: 'regions',
                id: 'a1',
                patch: { label: 'Shop', tint: '#000000' },
            }),
        ],
        [
            'area resize',
            () => ({
                type: 'item.update',
                collection: 'regions',
                id: 'a1',
                patch: { box: { x: 0, y: 0, width: 10, height: 11 } },
            }),
        ],
        [
            'area delete (tables stay)',
            () => ({ type: 'item.remove', collection: 'regions', id: 'a1' }),
        ],
        ['area drag with members', (d) => planMoveRegion(d, 'a1', 200, 300)!],
        ['note add', () => planAddMemo({ random: rng(11) })],
        [
            'note edit',
            () => ({
                type: 'item.update',
                collection: 'memos',
                id: 'n1',
                patch: { body: 'new text', tint: '#000' },
            }),
        ],
        [
            'note move',
            () => ({
                type: 'item.update',
                collection: 'memos',
                id: 'n1',
                patch: { box: { x: 1, y: 2, width: 200, height: 150 } },
            }),
        ],
        [
            'note delete',
            () => ({ type: 'item.remove', collection: 'memos', id: 'n1' }),
        ],
        [
            'auto arrange (many moves, one step)',
            () => ({
                type: 'entity.move',
                moves: [
                    { id: 't1', x: 0, y: 0 },
                    { id: 't2', x: 0, y: 500 },
                    { id: 't3', x: 500, y: 0 },
                ],
            }),
        ],
        [
            'duplicate',
            (d) => planDuplicateEntity(d, 't1', { now: NOW, random: rng(12) })!,
        ],
        [
            'paste',
            (d) =>
                planPaste(d, makeClip(d, ['t1', 't2']), 0, {
                    now: NOW,
                    random: rng(13),
                })!,
        ],
        [
            'replace whole design (DBML accept, re-sync, open)',
            (d) => ({
                type: 'design.replace',
                design: {
                    ...d,
                    name: 'Swapped',
                    entities: { ...d.entities, order: [] },
                },
            }),
        ],
        [
            'group',
            () => ({
                type: 'group',
                commands: [
                    { type: 'design.rename', name: 'g' },
                    { type: 'entity.update', id: 't1', patch: { name: 'g1' } },
                ],
            }),
        ],
    ];

    it.each(cases)('%s', (_name, make) => {
        checkUndo(base, make(base));
    });
});

describe('EDT-100 / EDT-186 deleting a table', () => {
    it('removes the table, its links and its dependencies, and undo brings all back in place', () => {
        const d = shopDesign();
        const gone = applyOk(d, { type: 'entity.remove', id: 't2' }).design;
        expect(gone.entities.byId.t2).toBeUndefined();
        expect(gone.links.order).toEqual([]);
        expect(gone.dependencies).toEqual([]);
        expect(Object.keys(gone.columns)).not.toContain('f9');
        expect(Object.keys(gone.keys)).not.toContain('i9');
        const back = applyOk(
            gone,
            applyOk(d, { type: 'entity.remove', id: 't2' }).inverse
        ).design;
        expect(sameButDate(back, d)).toEqual(d);
        expect(back.entities.order).toEqual(['t1', 't2', 't3']);
    });

    it('deleting several tables is one group and one undo', () => {
        const d = shopDesign();
        const r = applyOk(d, planDeleteEntities(['t1', 't2']));
        expect(r.design.entities.order).toEqual(['t3']);
        expect(sameButDate(applyOk(r.design, r.inverse).design, d)).toEqual(d);
    });
});

describe('EDT-099 duplicate a table', () => {
    it('copies columns and keys under new ids, offset 30 and 50, no links', () => {
        const d = shopDesign();
        const next = applyOk(
            d,
            planDuplicateEntity(d, 't1', { now: NOW, random: rng(1) })!
        ).design;
        expect(next.entities.order).toHaveLength(4);
        const copy = next.entities.byId[next.entities.order[3]];
        expect(copy).toMatchObject({ name: 'customers_copy', x: 150, y: 130 });
        const parts = partsOf(next, copy);
        expect(parts.columns.map((c) => c.name)).toEqual([
            'id',
            'email',
            'tags',
        ]);
        expect(
            parts.columns.every((c) => !['f1', 'f2', 'f3'].includes(c.id))
        ).toBe(true);
        expect(parts.keys[0]).toMatchObject({
            pk: true,
            label: '',
            members: [parts.columns[0].id],
        });
        expect(parts.keys[1].members).toEqual([parts.columns[2].id]);
        expect(next.links.order).toEqual(['r1']);
    });
});

describe('EDT-230 to EDT-237 paste', () => {
    it('EDT-231 keeps a free name and adds _copy, _copy2, _copy3 otherwise (case-insensitive, per schema)', () => {
        let d = shopDesign();
        const clip = makeClip(d, ['t1']);
        const names: string[] = [];
        for (let i = 0; i < 3; i++) {
            d = applyOk(
                d,
                planPaste(d, clip, i, { now: NOW, random: rng(20 + i) })!
            ).design;
            names.push(
                d.entities.byId[d.entities.order[d.entities.order.length - 1]]
                    .name
            );
        }
        expect(names).toEqual([
            'customers_copy',
            'customers_copy2',
            'customers_copy3',
        ]);
        // a different schema has its own names; case does not matter
        const other = applyOk(shopDesign(), {
            type: 'entity.update',
            id: 't1',
            patch: { name: 'CUSTOMERS' },
        }).design;
        const pasted = applyOk(
            other,
            planPaste(
                other,
                {
                    entities: [
                        partsOf(shopDesign(), shopDesign().entities.byId.t1),
                    ],
                },
                0,
                { random: rng(2) }
            )!
        ).design;
        expect(pasted.entities.byId[pasted.entities.order[3]].name).toBe(
            'customers_copy'
        );
        const elsewhere = applyOk(other, {
            type: 'entity.update',
            id: 't1',
            patch: { schema: 'sales' },
        }).design;
        const free = applyOk(
            elsewhere,
            planPaste(
                elsewhere,
                {
                    entities: [
                        partsOf(shopDesign(), shopDesign().entities.byId.t1),
                    ],
                },
                0,
                { random: rng(2) }
            )!
        ).design;
        expect(free.entities.byId[free.entities.order[3]].name).toBe(
            'customers'
        );
    });

    it('EDT-232 lands right of the group by its width plus 40; each paste one slot further', () => {
        const d = shopDesign();
        const clip = makeClip(d, ['t1', 't2']);
        // group spans x 120 .. 520+224 = 744 -> width 624, shift 664
        const first = applyOk(
            d,
            planPaste(d, clip, 0, { random: rng(1) })!
        ).design;
        const second = applyOk(
            d,
            planPaste(d, clip, 1, { random: rng(1) })!
        ).design;
        const xs = (design: Design) =>
            design.entities.order
                .slice(3)
                .map((id) => design.entities.byId[id].x);
        expect(xs(first)).toEqual([120 + 664, 520 + 664]);
        expect(xs(second)).toEqual([120 + 1328, 520 + 1328]);
    });

    it('EDT-233 schema only for schema databases; area only if it exists', () => {
        const d = shopDesign();
        const clip = makeClip(d, ['t1']);
        const inShop = applyOk(
            d,
            planPaste(d, clip, 0, { random: rng(1) })!
        ).design;
        expect(inShop.entities.byId[inShop.entities.order[3]]).toMatchObject({
            schema: 'public',
            regionId: 'a1',
        });

        const sqlite = withTables(['x'], 'sqlite');
        const pasted = applyOk(
            sqlite,
            planPaste(sqlite, clip, 0, { random: rng(1) })!
        ).design;
        const entity = pasted.entities.byId[pasted.entities.order[1]];
        expect(entity.schema).toBeUndefined();
        expect(entity.regionId).toBeUndefined();
    });

    it('EDT-234 copies columns and indexes, never links or dependencies', () => {
        const d = shopDesign();
        const next = applyOk(
            d,
            planPaste(d, makeClip(d, ['t1', 't2']), 0, { random: rng(1) })!
        ).design;
        expect(next.links.order).toEqual(['r1']);
        expect(next.dependencies).toHaveLength(1);
        expect(Object.keys(next.columns).length).toBe(
            Object.keys(d.columns).length + 6
        );
        expect(new Set(next.entities.order).size).toBe(5);
    });

    it('EDT-237 paste is refused in a read-only diagram', () => {
        const d = shopDesign();
        const paste = planPaste(d, makeClip(d, ['t1']), 0, { random: rng(1) })!;
        expect(apply(d, paste, { readOnly: true })).toMatchObject({
            ok: false,
            reason: 'read-only',
        });
    });

    it('EDT-230 an empty clip pastes nothing', () => {
        expect(planPaste(shopDesign(), { entities: [] })).toBeUndefined();
        expect(makeClip(shopDesign(), ['nope']).entities).toEqual([]);
    });
});

describe('EDT-075 / EDT-077 add table and view at the end', () => {
    it('is appended to the list', () => {
        const d = withTables(['a', 'b']);
        const next = applyOk(
            d,
            planAddEntity(d, { now: NOW, random: rng(2) })
        ).design;
        expect(next.entities.order).toHaveLength(3);
        expect(next.entities.byId[next.entities.order[2]].name).toBe('table_3');
        expect(listOf(next.entities)[2].schema).toBe('public');
    });

    it('takes the schema from the visible ones', () => {
        const d = blank();
        const next = applyOk(
            d,
            planAddEntity(d, { visibleSchemas: ['sales'], random: rng(2) })
        ).design;
        expect(listOf(next.entities)[0].schema).toBe('sales');
    });
});

describe('EDT-105 / EDT-106 order of the tables list', () => {
    it('dragging a row re-orders the list and undoes', () => {
        const d = shopDesign();
        const next = checkUndo(d, {
            type: 'entity.reorder',
            ids: ['t3', 't2', 't1'],
        });
        expect(next.entities.order).toEqual(['t3', 't2', 't1']);
    });
});

describe('EDT-101 changing schema touches one table only', () => {
    it('leaves schema-less tables alone and keeps link schemas in step', () => {
        let d = withTables(['a', 'b'], 'mysql');
        const noSchema = d.entities.order.map(
            (id) => d.entities.byId[id].schema
        );
        d = applyOk(d, planChangeSchema(d.entities.order[0], 'x')).design;
        expect(d.entities.byId[d.entities.order[1]].schema).toBe(noSchema[1]);

        const shopD = shopDesign();
        const moved = applyOk(shopD, planChangeSchema('t1', 'sales')).design;
        expect(moved.links.byId.r1.sourceSchema).toBe('sales');
        expect(moved.links.byId.r1.targetSchema).toBe('public');
        expect(moved.entities.byId.t2.schema).toBe('public');
        const cleared = applyOk(
            shopD,
            planChangeSchema('t1', undefined)
        ).design;
        expect(cleared.entities.byId.t1.schema).toBeUndefined();
        expect(cleared.links.byId.r1.sourceSchema).toBeUndefined();
    });
});

describe('EDT-094 an empty name is ignored', () => {
    it('on a table, an area and the diagram', () => {
        const d = shopDesign();
        for (const command of [
            { type: 'entity.update', id: 't1', patch: { name: '  ' } },
            {
                type: 'item.update',
                collection: 'regions',
                id: 'a1',
                patch: { name: '' },
            },
            { type: 'design.rename', name: ' ' },
        ] as Command[]) {
            const r = apply(d, command);
            expect(r.ok && r.changed).toBe(false);
        }
    });
});

describe('EDT-117 / EDT-123 / EDT-124 / EDT-133 / EDT-134 / EDT-135 columns', () => {
    it('EDT-117 a new column is appended as field_N', () => {
        const d = withTables(['a']);
        const id = d.entities.order[0];
        const next = applyOk(
            d,
            planAddColumn(d, id, { now: NOW, random: rng(1) })!
        ).design;
        const entity = next.entities.byId[id];
        expect(entity.columnIds).toHaveLength(2);
        expect(next.columns[entity.columnIds[1]]).toMatchObject({
            name: 'field_2',
            nullable: true,
            primaryKey: false,
            unique: false,
        });
    });

    it('EDT-123 size, precision and scale stay only if the new type has them; the default always goes', () => {
        const d = shopDesign();
        const caps = {
            hasLength: false,
            hasPrecisionScale: true,
            allowsArray: false,
        };
        const withDefault = applyOk(
            d,
            planUpdateColumn('t1', 'f2', {
                precision: 8,
                scale: 2,
                default: "'a'",
            })
        ).design;
        const next = applyOk(
            withDefault,
            planChangeColumnType(
                't1',
                'f2',
                { id: 'numeric', name: 'numeric' },
                caps,
                {
                    length: withDefault.columns.f2.length,
                    precision: 8,
                    scale: 2,
                    isArray: true,
                }
            )
        ).design;
        expect(next.columns.f2).toMatchObject({
            type: { id: 'numeric' },
            precision: 8,
            scale: 2,
        });
        expect(next.columns.f2.length).toBeUndefined();
        expect(next.columns.f2.default).toBeUndefined();
        expect(next.columns.f2.isArray).toBeUndefined();
        const keep = applyOk(
            d,
            planChangeColumnType(
                't1',
                'f2',
                { id: 'char', name: 'char' },
                {
                    hasLength: true,
                    hasPrecisionScale: false,
                    allowsArray: true,
                },
                { length: 255, isArray: true }
            )
        ).design;
        expect(keep.columns.f2).toMatchObject({ length: 255, isArray: true });
    });

    it('EDT-124 the serial family is not null and auto-increment', () => {
        const d = shopDesign();
        const next = applyOk(
            d,
            planChangeColumnType(
                't1',
                'f3',
                { id: 'bigserial', name: 'bigserial' },
                {
                    hasLength: false,
                    hasPrecisionScale: false,
                    allowsArray: false,
                }
            )
        ).design;
        expect(next.columns.f3).toMatchObject({
            nullable: false,
            increment: true,
        });
        const stillSerial = applyOk(
            next,
            planUpdateColumn('t1', 'f3', { nullable: true })
        ).design;
        expect(stillSerial.columns.f3).toMatchObject({
            nullable: false,
            increment: true,
        });
    });

    it('EDT-133 turning nullable on clears auto increment', () => {
        const d = shopDesign();
        const auto = applyOk(
            d,
            planUpdateColumn('t1', 'f3', { increment: true, nullable: false })
        ).design;
        const next = applyOk(
            auto,
            planUpdateColumn('t1', 'f3', { nullable: true })
        ).design;
        expect(next.columns.f3.nullable).toBe(true);
        expect(next.columns.f3.increment).toBe(false);
    });

    it('EDT-134 a primary key is not null; the first one is also unique; several are allowed', () => {
        let d = withTables(['a']);
        const id = d.entities.order[0];
        d = applyOk(
            d,
            planUpdateColumn(id, d.entities.byId[id].columnIds[0], {
                primaryKey: false,
                unique: false,
                nullable: true,
            })
        ).design;
        expect(partsOf(d, d.entities.byId[id]).keys).toEqual([]);
        d = applyOk(
            d,
            planAddColumn(d, id, { now: NOW, random: rng(1) })!
        ).design;
        d = applyOk(
            d,
            planAddColumn(d, id, { now: NOW, random: rng(2) })!
        ).design;
        const [c1, c2] = d.entities.byId[id].columnIds;
        d = applyOk(d, planUpdateColumn(id, c1, { primaryKey: true })).design;
        expect(d.columns[c1]).toMatchObject({
            primaryKey: true,
            nullable: false,
            unique: true,
        });
        d = applyOk(d, planUpdateColumn(id, c2, { primaryKey: true })).design;
        expect(d.columns[c2]).toMatchObject({
            primaryKey: true,
            nullable: false,
            unique: false,
        });
        const keys = partsOf(d, d.entities.byId[id]).keys;
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatchObject({
            pk: true,
            label: '',
            members: [c1, c2],
        });
        d = applyOk(d, planUpdateColumn(id, c1, { primaryKey: false })).design;
        expect(d.columns[c1].unique).toBe(true); // unsetting only clears the flag
        expect(partsOf(d, d.entities.byId[id]).keys[0].members).toEqual([c2]);
    });

    it('EDT-135 an edit repairs a nullable primary key from old data', () => {
        const file = JSON.parse(JSON.stringify(shop));
        file.tables[0].fields[0].nullable = true;
        const d = parse(file, { now: NOW }).design;
        expect(d.columns.f1.nullable).toBe(false); // repaired on load
        const edited = applyOk(
            d,
            planUpdateColumn('t1', 'f2', { name: 'mail' })
        ).design;
        expect(edited.columns.f1.nullable).toBe(false);
    });

    it('EDT-136 reordering columns keeps the primary-key index in column order', () => {
        let d = shopDesign();
        d = applyOk(
            d,
            planUpdateColumn('t1', 'f2', { primaryKey: true })
        ).design;
        expect(partsOf(d, d.entities.byId.t1).keys[0].members).toEqual([
            'f1',
            'f2',
        ]);
        d = applyOk(d, {
            type: 'part.reorder',
            entityId: 't1',
            part: 'columns',
            ids: ['f2', 'f3', 'f1'],
        }).design;
        expect(partsOf(d, d.entities.byId.t1).keys[0].members).toEqual([
            'f2',
            'f1',
        ]);
        expect(d.entities.byId.t1.columnIds).toEqual(['f2', 'f3', 'f1']);
    });
});

describe('EDT-138 / EDT-139 deleting a column', () => {
    it('EDT-139 removes the links that use it, and undo puts them back where they were', () => {
        const d = shopDesign();
        const r = applyOk(d, planDeleteColumn('t2', 'f10'));
        expect(r.design.links.order).toEqual([]);
        expect(r.design.entities.byId.t2.columnIds).toEqual(['f9', 'f11']);
        expect(sameButDate(applyOk(r.design, r.inverse).design, d)).toEqual(d);
    });

    it('takes the column out of every index', () => {
        const d = shopDesign();
        const next = applyOk(d, planDeleteColumn('t1', 'f3')).design;
        expect(next.keys.i2.members).toEqual([]);
        expect(next.columns.f3).toBeUndefined();
    });

    it('deleting the last primary-key column removes the primary-key index', () => {
        const d = shopDesign();
        const next = applyOk(d, planDeleteColumn('t2', 'f9')).design;
        expect(next.entities.byId.t2.keyIds).toEqual([]);
        expect(next.keys.i9).toBeUndefined();
    });
});

describe('EDT-141 to EDT-146 indexes', () => {
    it('EDT-141 a new index has the first index type of its database, none for SQLite', () => {
        const first = (type: Parameters<typeof withTables>[1]) => {
            const d = withTables(['a'], type);
            const command = planAddKey(d, d.entities.order[0], {}) as Extract<
                Command,
                { type: 'part.insert' }
            >;
            return (command.item as Key).algorithm;
        };
        expect(first('postgresql')).toBe('btree');
        expect(first('mysql')).toBe('btree');
        expect(first('mariadb')).toBe('btree');
        expect(first('sql_server')).toBe('nonclustered');
        expect(first('oracle')).toBe('btree');
        expect(first('sqlite')).toBeUndefined();
    });

    it('EDT-141 a new index is btree on PostgreSQL', () => {
        const pg = withTables(['a']);
        const key = (
            planAddKey(pg, pg.entities.order[0], {
                now: NOW,
                random: rng(1),
            }) as Extract<Command, { type: 'part.insert' }>
        ).item;
        expect(key).toMatchObject({
            label: 'index_2',
            distinct: false,
            members: [],
            algorithm: 'btree',
        });
    });

    it('a view takes no index or check', () => {
        const d = shopDesign();
        expect(planAddKey(d, 't3')).toBeUndefined();
        expect(apply(d, planAddRule('t3', { random: rng(1) })).ok).toBe(false);
    });

    it('DAT-044 / EDT-144 gin needs array, json, jsonb, tsvector or hstore columns; removing one resets the method', () => {
        const d = shopDesign();
        expect(canUseGin([d.columns.f3])).toBe(true);
        expect(canUseGin([d.columns.f3, d.columns.f2])).toBe(false);
        expect(canUseGin([])).toBe(false);
        expect(
            canUseGin([
                { ...d.columns.f2, type: { id: 'JSONB', name: 'jsonb' } },
            ])
        ).toBe(true);
        const widened = applyOk(
            d,
            planSetKeyColumns(d, 't1', 'i2', ['f3', 'f2'])!
        ).design;
        expect(widened.keys.i2).toMatchObject({
            members: ['f3', 'f2'],
            algorithm: 'btree',
        });
        const kept = applyOk(
            d,
            planSetKeyColumns(d, 't1', 'i2', ['f3'])!
        ).design;
        expect(kept.keys.i2.algorithm).toBe('gin');
    });

    it('EDT-145 the primary-key index cannot be edited by hand and sits first', () => {
        const d = shopDesign();
        const hand = applyOk(d, {
            type: 'part.update',
            entityId: 't1',
            part: 'keys',
            id: 'i1',
            patch: { members: ['f2'] },
        }).design;
        expect(hand.keys.i1.members).toEqual(['f1']);
        const second = applyOk(d, {
            type: 'part.reorder',
            entityId: 't1',
            part: 'keys',
            ids: ['i2', 'i1'],
        }).design;
        expect(second.entities.byId.t1.keyIds).toEqual(['i1', 'i2']);
        // its unique flag and comments can still change
        const unique = applyOk(d, {
            type: 'part.update',
            entityId: 't1',
            part: 'keys',
            id: 'i1',
            patch: { note: 'pk' },
        }).design;
        expect(unique.keys.i1.note).toBe('pk');
    });

    it('an index may only use columns of its own table', () => {
        const d = shopDesign();
        expect(
            planSetKeyColumns(d, 't1', 'i2', ['f10']) &&
                apply(d, planSetKeyColumns(d, 't1', 'i2', ['f10'])!).ok
        ).toBe(false);
    });
});

describe('EDT-148 / EDT-151 check constraints', () => {
    it('a new check is empty; edit and delete work', () => {
        let d = shopDesign();
        d = applyOk(d, planAddRule('t2', { now: NOW, random: rng(1) })).design;
        const rule = d.rules[d.entities.byId.t2.ruleIds[0]];
        expect(rule.expression).toBe('');
        d = applyOk(d, {
            type: 'part.update',
            entityId: 't2',
            part: 'rules',
            id: rule.id,
            patch: { expression: 'price > 0' },
        }).design;
        expect(d.rules[rule.id].expression).toBe('price > 0');
        d = applyOk(d, {
            type: 'part.remove',
            entityId: 't2',
            part: 'rules',
            id: rule.id,
        }).design;
        expect(d.entities.byId.t2.ruleIds).toEqual([]);
        expect(d.rules[rule.id]).toBeUndefined();
    });
});

describe('EDT-153 to EDT-170 links', () => {
    const colOf = (d: Design, entityId: string, name: string) =>
        d.entities.byId[entityId].columnIds.find(
            (c) => d.columns[c].name === name
        )!;

    it('EDT-168 / DAT-050 a second link between the same two columns, in either direction, returns the first', () => {
        const d = shopDesign();
        const forward = planLink(
            d,
            { entityId: 't1', columnId: 'f1' },
            { entityId: 't2', columnId: 'f10' }
        );
        const backward = planLink(
            d,
            { entityId: 't2', columnId: 'f10' },
            { entityId: 't1', columnId: 'f1' }
        );
        expect(forward).toMatchObject({ kind: 'exists' });
        expect(backward).toMatchObject({ kind: 'exists' });
        expect(forward.kind === 'exists' && forward.link.id).toBe('r1');
    });

    it('EDT-154 incompatible types are refused', () => {
        const d = shopDesign();
        expect(
            planLink(
                d,
                { entityId: 't1', columnId: 'f2' },
                { entityId: 't2', columnId: 'f9' }
            )
        ).toEqual({ kind: 'refused', reason: 'incompatible' });
    });

    it('EDT-157 a view cannot take a link', () => {
        const d = shopDesign();
        expect(
            planLink(
                d,
                { entityId: 't3', columnId: 'f20' },
                { entityId: 't2', columnId: 'f9' }
            )
        ).toEqual({ kind: 'refused', reason: 'view' });
    });

    it('EDT-153 / EDT-167 a new link is one to one and named from the source', () => {
        let d = withTables(['customers', 'orders']);
        const [a, b] = d.entities.order;
        d = applyOk(
            d,
            planAddColumn(d, b, {
                name: 'customer_id',
                now: NOW,
                random: rng(1),
            })!
        ).design;
        const plan = planLink(
            d,
            { entityId: a, columnId: colOf(d, a, 'id') },
            { entityId: b, columnId: colOf(d, b, 'customer_id') },
            { now: NOW, random: rng(2) }
        );
        expect(plan.kind).toBe('ok');
        if (plan.kind !== 'ok') return;
        d = applyOk(d, plan.command).design;
        const link = listOf(d.links)[0];
        expect(link).toMatchObject({
            name: 'customers_id_fk',
            sourceCardinality: 'one',
            targetCardinality: 'one',
            sourceSchema: 'public',
        });
    });

    it('a link must point at columns that exist', () => {
        const d = shopDesign();
        expect(
            planLink(
                d,
                { entityId: 't1', columnId: 'f10' },
                { entityId: 't2', columnId: 'f10' }
            )
        ).toEqual({ kind: 'refused', reason: 'missing' });
        expect(
            planLink(
                d,
                { entityId: 'nope', columnId: 'f1' },
                { entityId: 't2', columnId: 'f10' }
            )
        ).toEqual({ kind: 'refused', reason: 'missing' });
    });

    it('EDT-169 compatible types: equal, or the short list', () => {
        const t = (id: string) => ({ id, name: id });
        expect(typesCompatible('postgresql', t('bigint'), t('BIGINT'))).toBe(
            true
        );
        expect(typesCompatible('postgresql', t('serial'), t('integer'))).toBe(
            true
        );
        expect(
            typesCompatible('postgresql', t('smallserial'), t('smallint'))
        ).toBe(true);
        expect(typesCompatible('postgresql', t('bigserial'), t('bigint'))).toBe(
            true
        );
        expect(
            typesCompatible('postgresql', t('bigserial'), t('integer'))
        ).toBe(false);
        expect(typesCompatible('postgresql', t('int'), t('integer'))).toBe(
            false
        );
        expect(typesCompatible('mysql', t('int'), t('integer'))).toBe(true);
        expect(typesCompatible('mysql', t('tinyint'), t('boolean'))).toBe(true);
        expect(typesCompatible('mysql', t('serial'), t('integer'))).toBe(false);
        expect(typesCompatible('sqlite', t('text'), t('integer'))).toBe(false);
    });

    it('DAT-047 / EDT-170 / EDT-176 the many side is always the target: N:1 swaps and stores 1:N', () => {
        const d = shopDesign();
        const link = d.links.byId.r1;
        const flipped = applyOk(d, planSetCardinality(link, 'many-to-one'))
            .design.links.byId.r1;
        expect(flipped).toMatchObject({
            sourceEntityId: 't2',
            sourceColumnId: 'f10',
            targetEntityId: 't1',
            targetColumnId: 'f1',
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
        const one = applyOk(d, planSetCardinality(link, 'one-to-one')).design
            .links.byId.r1;
        expect([
            one.sourceEntityId,
            one.sourceCardinality,
            one.targetCardinality,
        ]).toEqual(['t1', 'one', 'one']);
        const many = applyOk(
            applyOk(d, planSetCardinality(link, 'one-to-one')).design,
            planSetCardinality(one, 'one-to-many')
        ).design.links.byId.r1;
        expect([
            many.sourceEntityId,
            many.sourceCardinality,
            many.targetCardinality,
        ]).toEqual(['t1', 'one', 'many']);
    });

    it('EDT-177 switch tables swaps the ends; an old N:1 ends as 1:N', () => {
        const d = shopDesign();
        const sw = applyOk(d, planSwitchLink(d.links.byId.r1)).design.links.byId
            .r1;
        expect([
            sw.sourceEntityId,
            sw.targetEntityId,
            sw.sourceSchema,
            sw.sourceCardinality,
            sw.targetCardinality,
        ]).toEqual(['t2', 't1', 'public', 'one', 'many']);
        const one = applyOk(
            d,
            planSetCardinality(d.links.byId.r1, 'one-to-one')
        ).design;
        const sw11 = applyOk(one, planSwitchLink(one.links.byId.r1)).design
            .links.byId.r1;
        expect([
            sw11.sourceEntityId,
            sw11.sourceCardinality,
            sw11.targetCardinality,
        ]).toEqual(['t2', 'one', 'one']);
        // N:1 as old data can hold it: build one with a raw command
        const manyOne = applyOk(d, {
            type: 'item.update',
            collection: 'links',
            id: 'r1',
            patch: { sourceCardinality: 'many', targetCardinality: 'one' },
        }).design;
        expect(manyOne.links.byId.r1).toMatchObject({
            sourceCardinality: 'many',
            targetCardinality: 'one',
        });
        const sw21 = applyOk(manyOne, planSwitchLink(manyOne.links.byId.r1))
            .design.links.byId.r1;
        expect([
            sw21.sourceEntityId,
            sw21.sourceCardinality,
            sw21.targetCardinality,
        ]).toEqual(['t2', 'one', 'many']);
    });

    it('DAT-048 many to many can never be stored', () => {
        const d = shopDesign();
        const next = applyOk(d, {
            type: 'item.update',
            collection: 'links',
            id: 'r1',
            patch: { sourceCardinality: 'many', targetCardinality: 'many' },
        }).design;
        expect(next.links.byId.r1).toMatchObject({
            sourceCardinality: 'one',
            targetCardinality: 'many',
        });
    });

    it('EDT-181 delete a link and undo', () => {
        const d = shopDesign();
        const r = applyOk(d, planDeleteLink('r1'));
        expect(r.design.links.order).toEqual([]);
        expect(sameButDate(applyOk(r.design, r.inverse).design, d)).toEqual(d);
    });
});

describe('EDT-189 to EDT-199 custom types', () => {
    it('EDT-189 New Type adds type_N, an enum with no values', () => {
        const d = shopDesign();
        const next = applyOk(d, planAddUserType(d, { random: rng(1) })).design;
        const added = next.userTypes.byId[next.userTypes.order[2]];
        expect(added).toMatchObject({
            name: 'type_3',
            kind: 'enum',
            values: [],
        });
    });

    it('EDT-194 switching kind clears the data of the kind that is left', () => {
        const d = shopDesign();
        const comp = applyOk(d, planSetUserTypeKind('ct1', 'composite')).design
            .userTypes.byId.ct1;
        expect(comp).toMatchObject({ kind: 'composite', members: [] });
        expect(comp.values).toBeUndefined();
        const back = applyOk(d, planSetUserTypeKind('ct2', 'enum')).design
            .userTypes.byId.ct2;
        expect(back).toMatchObject({ kind: 'enum', values: [] });
        expect(back.members).toBeUndefined();
    });

    it('EDT-198 deleting a type leaves columns that used it as they are', () => {
        const d = shopDesign();
        const next = applyOk(d, {
            type: 'item.remove',
            collection: 'userTypes',
            id: 'ct1',
        }).design;
        expect(next.columns.f11.type).toEqual({
            id: 'order_status',
            name: 'order_status',
        });
    });
});

describe('EDT-200 to EDT-210 areas', () => {
    it('EDT-207 deleting an area keeps its tables and clears their membership', () => {
        const d = shopDesign();
        const next = applyOk(d, {
            type: 'item.remove',
            collection: 'regions',
            id: 'a1',
        }).design;
        expect(next.entities.byId.t1.regionId).toBeUndefined();
        expect(next.entities.order).toEqual(['t1', 't2', 't3']);
    });

    it('EDT-037 / EDT-224 dragging an area moves its members by the same amount in one step', () => {
        const d = shopDesign();
        const r = applyOk(d, planMoveRegion(d, 'a1', 160, 120)!);
        expect(r.design.regions.byId.a1).toMatchObject({
            box: { x: 160, y: 120, width: 700, height: 400 },
        });
        expect(r.design.entities.byId.t1).toMatchObject({ x: 220, y: 180 });
        expect(r.design.entities.byId.t2).toMatchObject({ x: 520, y: 80 }); // not a member
        expect(sameButDate(applyOk(r.design, r.inverse).design, d)).toEqual(d);
    });
});

describe('EDT-224 coalescing keys', () => {
    it('typing and resizing have keys; structural edits do not', () => {
        expect(
            coalesceKey({
                type: 'entity.update',
                id: 'a',
                patch: { name: 'x' },
            })
        ).toBe(
            coalesceKey({
                type: 'entity.update',
                id: 'a',
                patch: { name: 'xy' },
            })
        );
        expect(
            coalesceKey({
                type: 'entity.update',
                id: 'a',
                patch: { name: 'x' },
            })
        ).not.toBe(
            coalesceKey({
                type: 'entity.update',
                id: 'b',
                patch: { name: 'x' },
            })
        );
        expect(
            coalesceKey({
                type: 'entity.update',
                id: 'a',
                patch: { name: 'x' },
            })
        ).not.toBe(
            coalesceKey({
                type: 'entity.update',
                id: 'a',
                patch: { comments: 'x' },
            })
        );
        expect(coalesceKey({ type: 'entity.remove', id: 'a' })).toBeUndefined();
        expect(coalesceKey({ type: 'group', commands: [] })).toBeUndefined();
    });
});
