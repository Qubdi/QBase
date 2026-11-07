import { describe, expect, it } from 'vitest';
import { applyOk, blank } from '@/core/testing/helpers';
import { planAddEntity } from '@/core/commands/plan-entity';
import { isVisible } from '@/core/model/visibility-filter';
import {
    buildTree,
    hidesEverything,
    isFilterActive,
    setTableShown,
    setTablesShown,
    visibleIds,
} from '../filter-tree';

function schemaDesign() {
    let design = blank('postgresql');
    for (const [name, schema] of [
        ['users', 'public'],
        ['orders', 'public'],
        ['invoices', 'billing'],
    ] as const)
        design = applyOk(
            design,
            planAddEntity(design, { name, schema })
        ).design;
    return design;
}

const byName = (design: ReturnType<typeof schemaDesign>, name: string) =>
    design.entities.order
        .map((id) => design.entities.byId[id])
        .find((e) => e.name === name)!;

describe('EDT-062 EDT-063 the filter tree', () => {
    const design = schemaDesign();

    it('groups by schema, each with its tables', () => {
        const tree = buildTree({
            design,
            filter: {},
            groupBy: 'schema',
            showViews: true,
        });
        expect(tree.map((g) => g.label)).toEqual(['public', 'billing']);
        expect(tree[0].tables.map((t) => t.entity.name)).toEqual([
            'users',
            'orders',
        ]);
        expect(tree.every((g) => g.shown === 'all')).toBe(true);
    });

    it('groups by area and keeps tables without one last', () => {
        const withRegion = applyOk(design, {
            type: 'item.insert',
            collection: 'regions',
            item: {
                id: 'r1',
                label: 'Sales',
                tint: '#fff',
                box: { x: 0, y: 0, width: 10, height: 10 },
            },
        }).design;
        const orders = byName(withRegion, 'orders');
        const placed = applyOk(withRegion, {
            type: 'entity.update',
            id: orders.id,
            patch: { regionId: 'r1' },
        }).design;
        const tree = buildTree({
            design: placed,
            filter: {},
            groupBy: 'area',
            showViews: true,
        });
        expect(tree.map((g) => g.label)).toEqual(['Sales', '']);
        expect(tree[1].named).toBe(false);
        expect(tree[1].tables).toHaveLength(2);
    });
});

describe('EDT-066 searching never changes what is hidden', () => {
    const design = schemaDesign();

    it('narrows the rows by name and drops empty groups', () => {
        const tree = buildTree({
            design,
            filter: {},
            groupBy: 'schema',
            text: 'INV',
            showViews: true,
        });
        expect(tree.map((g) => g.label)).toEqual(['billing']);
    });

    it('leaves the hidden set alone', () => {
        const filter = setTableShown(
            design,
            {},
            byName(design, 'users').id,
            false
        );
        const before = [...visibleIds(design, filter)];
        buildTree({
            design,
            filter,
            groupBy: 'schema',
            text: 'x',
            showViews: true,
        });
        expect([...visibleIds(design, filter)]).toEqual(before);
    });
});

describe('EDT-063 EDT-064 EDT-072 showing and hiding', () => {
    const design = schemaDesign();
    const users = byName(design, 'users');
    const orders = byName(design, 'orders');
    const invoices = byName(design, 'invoices');

    it('hides one table and keeps the others', () => {
        const filter = setTableShown(design, {}, users.id, false);
        expect(isVisible(filter, users)).toBe(false);
        expect(isVisible(filter, orders, 'public')).toBe(true);
        expect(isFilterActive(design, filter)).toBe(true);
    });

    it('a schema whose tables are all ticked counts as the schema', () => {
        const hidden = setTablesShown(
            design,
            {},
            [users.id, orders.id, invoices.id],
            false
        );
        const half = setTableShown(design, hidden, users.id, true);
        const full = setTableShown(design, half, orders.id, true);
        expect(full.schemaIds).toEqual(['public']);
        expect(full.tableIds).toBeUndefined();
    });

    it('showing everything turns the filter off', () => {
        const hidden = setTableShown(design, {}, users.id, false);
        const back = setTableShown(design, hidden, users.id, true);
        expect(back).toEqual({});
        expect(isFilterActive(design, back)).toBe(false);
    });

    it('a group eye hides all of its tables', () => {
        const filter = setTablesShown(design, {}, [users.id, orders.id], false);
        expect([...visibleIds(design, filter)]).toEqual([invoices.id]);
        const tree = buildTree({
            design,
            filter,
            groupBy: 'schema',
            showViews: true,
        });
        expect(tree.map((g) => g.shown)).toEqual(['none', 'all']);
    });

    it('reports a partly shown group as some', () => {
        const filter = setTableShown(design, {}, users.id, false);
        const tree = buildTree({
            design,
            filter,
            groupBy: 'schema',
            showViews: true,
        });
        expect(tree[0].shown).toBe('some');
    });
});

describe('EDT-069 the filter hides every table', () => {
    const design = schemaDesign();

    it('is detected so the canvas can offer Show all', () => {
        const none = setTablesShown(
            design,
            {},
            [...design.entities.order],
            false
        );
        expect(hidesEverything(design, none)).toBe(true);
        expect(hidesEverything(design, {})).toBe(false);
    });

    it('is not reported for a diagram without tables', () => {
        expect(hidesEverything(blank(), { tableIds: [] })).toBe(false);
    });
});
