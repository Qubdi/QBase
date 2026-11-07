import { describe, expect, it } from 'vitest';
import { applyOk, blank, withTables } from '@/core/testing/helpers';
import { planAddEntity } from '@/core/commands/plan-entity';
import {
    knownSchemas,
    listTables,
    planReorderTables,
    visibleSchemas,
} from '../table-list';

const names = (list: { name: string }[]) => list.map((e) => e.name);

describe('EDT-103 EDT-108 EDT-109 the Tables list rows', () => {
    const design = withTables(['orders', 'users', 'items']);

    it('lists tables in the design order', () => {
        expect(
            names(listTables({ design, filter: {}, showViews: true }))
        ).toEqual(['orders', 'users', 'items']);
    });

    it('narrows by a case-insensitive part of the name', () => {
        expect(
            names(
                listTables({ design, filter: {}, showViews: true, text: 'ER' })
            )
        ).toEqual(['orders', 'users']);
    });

    it('shows nothing when no name matches', () => {
        expect(
            listTables({ design, filter: {}, showViews: true, text: 'zzz' })
        ).toEqual([]);
    });

    it('honours the visibility filter', () => {
        const id = design.entities.order[1];
        expect(
            names(
                listTables({
                    design,
                    filter: { tableIds: [id] },
                    showViews: true,
                })
            )
        ).toEqual(['users']);
    });

    it('lists views only while Database Views is on', () => {
        const withView = applyOk(
            design,
            planAddEntity(design, { kind: 'view', name: 'v' })
        ).design;
        expect(
            names(
                listTables({ design: withView, filter: {}, showViews: false })
            )
        ).toEqual(['orders', 'users', 'items']);
        expect(
            names(listTables({ design: withView, filter: {}, showViews: true }))
        ).toContain('v');
    });
});

describe('EDT-103 EDT-275 schema labels', () => {
    it('counts the schemas of the listed tables', () => {
        let design = blank('postgresql');
        design = applyOk(
            design,
            planAddEntity(design, { name: 'a', schema: 'public' })
        ).design;
        design = applyOk(
            design,
            planAddEntity(design, { name: 'b', schema: 'billing' })
        ).design;
        expect(visibleSchemas(design, {}, true)).toEqual(['public', 'billing']);
        expect(
            visibleSchemas(
                design,
                { tableIds: [design.entities.order[0]] },
                true
            )
        ).toEqual(['public']);
        expect(knownSchemas(design)).toEqual(['public', 'billing']);
    });

    it('has none for a database without schemas', () => {
        const design = withTables(['a'], 'mysql');
        expect(visibleSchemas(design, {}, true)).toEqual([]);
        expect(knownSchemas(design)).toEqual([]);
    });
});

describe('EDT-105 dragging a row re-orders the list', () => {
    const design = withTables(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = design.entities.order;

    it('puts the dragged table where the other one was', () => {
        const command = planReorderTables(design, a, c);
        expect(command).toEqual({
            type: 'entity.reorder',
            ids: [b, c, a, d],
        });
        const next = applyOk(design, command!).design;
        expect(next.entities.order).toEqual([b, c, a, d]);
    });

    it('is a no-op when dropped on itself or on an unknown id', () => {
        expect(planReorderTables(design, a, a)).toBeUndefined();
        expect(planReorderTables(design, a, 'nope')).toBeUndefined();
    });

    it('can be undone with the inverse', () => {
        const done = applyOk(design, planReorderTables(design, d, a)!);
        expect(
            applyOk(done.design, done.inverse).design.entities.order
        ).toEqual(design.entities.order);
    });
});
