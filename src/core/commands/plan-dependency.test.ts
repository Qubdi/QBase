import { describe, expect, it } from 'vitest';
import { apply } from './apply';
import {
    dependencyBetween,
    planDeleteDependency,
    planDependency,
} from './plan-dependency';
import { planAddEntity } from './plan-entity';
import { applyOk, NOW, rng, sameButDate, withTables } from '../testing/helpers';

function withView() {
    const base = withTables(['users']);
    return applyOk(
        base,
        planAddEntity(base, {
            kind: 'view',
            name: 'v',
            now: NOW,
            random: rng(5),
        })
    ).design;
}

function ids(d: ReturnType<typeof withView>) {
    const [table, view] = d.entities.order;
    return { table, view };
}

describe('EDT-183 creating a dependency', () => {
    it('joins a view to a table and keeps the view as the dependent end', () => {
        const d = withView();
        const { table, view } = ids(d);
        const plan = planDependency(d, view, table, {
            now: NOW,
            random: rng(3),
        });
        if (plan.kind !== 'ok') throw new Error(plan.kind);
        const next = applyOk(d, plan.command).design;
        expect(next.dependencies).toHaveLength(1);
        expect(next.dependencies[0]).toMatchObject({
            tableId: table,
            dependentTableId: view,
        });
        expect(dependencyBetween(next, view, table)).toBeDefined();
    });

    it('returns the existing record for a pair already joined', () => {
        const d = withView();
        const { table, view } = ids(d);
        const plan = planDependency(d, view, table, { random: rng(3) });
        if (plan.kind !== 'ok') throw new Error(plan.kind);
        const next = applyOk(d, plan.command).design;
        expect(planDependency(next, view, table).kind).toBe('exists');
    });

    it('refuses a drag that does not start on a view, or lands on itself', () => {
        const d = withView();
        const { table, view } = ids(d);
        expect(planDependency(d, table, view).kind).toBe('refused');
        expect(planDependency(d, view, view).kind).toBe('refused');
        expect(planDependency(d, view, 'nope').kind).toBe('refused');
    });

    it('is refused for a dangling or duplicate record', () => {
        const d = withView();
        const { table, view } = ids(d);
        const plan = planDependency(d, view, table, { random: rng(3) });
        if (plan.kind !== 'ok') throw new Error(plan.kind);
        const next = applyOk(d, plan.command).design;
        expect(apply(next, plan.command).ok).toBe(false);
        expect(
            apply(d, {
                type: 'dependency.insert',
                item: { ...plan.dependency, tableId: 'gone' },
            }).ok
        ).toBe(false);
    });
});

describe('EDT-185 deleting a dependency', () => {
    it('removes it and undo puts it back in place', () => {
        const d0 = withView();
        const { table, view } = ids(d0);
        const a = planDependency(d0, view, table, { random: rng(3) });
        if (a.kind !== 'ok') throw new Error(a.kind);
        const d1 = applyOk(d0, a.command).design;
        const gone = applyOk(d1, planDeleteDependency(a.dependency.id));
        expect(gone.design.dependencies).toEqual([]);
        expect(
            sameButDate(applyOk(gone.design, gone.inverse).design, d1)
        ).toEqual(d1);
        expect(applyOk(d0, a.command).inverse).toEqual({
            type: 'dependency.remove',
            id: a.dependency.id,
        });
        expect(apply(d1, planDeleteDependency('nope')).ok).toBe(false);
    });
});

describe('EDT-186 deleting a view', () => {
    it('removes its dependencies in the same undo step', () => {
        const d0 = withView();
        const { table, view } = ids(d0);
        const a = planDependency(d0, view, table, { random: rng(3) });
        if (a.kind !== 'ok') throw new Error(a.kind);
        const d1 = applyOk(d0, a.command).design;
        const gone = applyOk(d1, { type: 'entity.remove', id: view });
        expect(gone.design.dependencies).toEqual([]);
        expect(
            sameButDate(applyOk(gone.design, gone.inverse).design, d1)
        ).toEqual(d1);
        const other = applyOk(d1, { type: 'entity.remove', id: table });
        expect(other.design.dependencies).toEqual([]);
    });
});
