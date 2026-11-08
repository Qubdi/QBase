import type { Dependency } from '../model/dependency';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import { newId } from '../model/ids';
import { entityOf } from '../model/lookup';
import type { Command } from './command';
import type { PlanOptions } from './plan-entity';

export type DependencyPlan =
    | { kind: 'ok'; command: Command; dependency: Dependency }
    | { kind: 'exists'; dependency: Dependency }
    | { kind: 'refused'; reason: 'missing' | 'not-view' | 'same' };

/** The dependency joining a view to a table, if there is one. */
export function dependencyBetween(
    design: Design,
    viewId: Id,
    tableId: Id
): Dependency | undefined {
    return design.dependencies.find(
        (d) => d.dependentTableId === viewId && d.tableId === tableId
    );
}

/**
 * Plans "this view reads this table" (EDT-183). The drag starts on a view's
 * edge dot, so the view is fixed; the other end may be any other table or
 * view. A pair that is already joined returns the existing record.
 */
export function planDependency(
    design: Design,
    viewId: Id,
    tableId: Id,
    options: PlanOptions = {}
): DependencyPlan {
    const view = entityOf(design, viewId);
    const table = entityOf(design, tableId);
    if (!view || !table) return { kind: 'refused', reason: 'missing' };
    if (view.kind !== 'view') return { kind: 'refused', reason: 'not-view' };
    if (viewId === tableId) return { kind: 'refused', reason: 'same' };
    const existing = dependencyBetween(design, viewId, tableId);
    if (existing) return { kind: 'exists', dependency: existing };
    const dependency: Dependency = {
        id: newId(options.random),
        tableId,
        dependentTableId: viewId,
        createdAt: options.now ?? Date.now(),
    };
    if (table.schema) dependency.schema = table.schema;
    if (view.schema) dependency.dependentSchema = view.schema;
    return {
        kind: 'ok',
        dependency,
        command: { type: 'dependency.insert', item: dependency },
    };
}

export function planDeleteDependency(id: Id): Command {
    return { type: 'dependency.remove', id };
}
