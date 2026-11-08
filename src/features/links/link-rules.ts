import type { LinkPlan, CardinalityChoice } from '@/core/commands/plan-link';
import type { Design } from '@/core/model/design';
import type { Dependency } from '@/core/model/dependency';
import type { Link } from '@/core/model/link';
import { listOf } from '@/core/model/collection';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { listTables, nameMatches } from '@/features/tables/table-list';

export interface RefsInput {
    design: Design;
    filter: VisibilityFilter;
    showViews: boolean;
    text?: string;
}

/**
 * The rows of the Refs list (EDT-178 to EDT-182): a link shows only when both
 * of its tables are visible, and the text matches the link name or either
 * table name.
 */
export function listRefs({
    design,
    filter,
    showViews,
    text = '',
}: RefsInput): Link[] {
    const visible = new Set(
        listTables({ design, filter, showViews }).map((e) => e.id)
    );
    return listOf(design.links).filter((link) => {
        if (!visible.has(link.sourceEntityId)) return false;
        if (!visible.has(link.targetEntityId)) return false;
        const names = [
            link.name,
            design.entities.byId[link.sourceEntityId]?.name ?? '',
            design.entities.byId[link.targetEntityId]?.name ?? '',
        ];
        return text.trim() === '' || names.some((n) => nameMatches(n, text));
    });
}

/**
 * The Dependencies group (EDT-184): same rules as relationships. A dependency
 * shows only when both of its tables are visible and the text matches either
 * table name.
 */
export function listDependencies({
    design,
    filter,
    showViews,
    text = '',
}: RefsInput): Dependency[] {
    const visible = new Set(
        listTables({ design, filter, showViews }).map((e) => e.id)
    );
    return design.dependencies.filter((dep) => {
        if (!visible.has(dep.tableId) || !visible.has(dep.dependentTableId))
            return false;
        const names = [
            design.entities.byId[dep.tableId]?.name ?? '',
            design.entities.byId[dep.dependentTableId]?.name ?? '',
        ];
        return text.trim() === '' || names.some((n) => nameMatches(n, text));
    });
}

/** What the Cardinality drop-down shows for a link (EDT-179). */
export function cardinalityChoiceOf(
    link: Pick<Link, 'sourceCardinality' | 'targetCardinality'>
): CardinalityChoice {
    if (link.sourceCardinality === 'many' && link.targetCardinality === 'one')
        return 'many-to-one';
    if (link.targetCardinality === 'many') return 'one-to-many';
    return 'one-to-one';
}

/** The text key that explains why a planned link cannot be made (EDT-154, EDT-155). */
export type LinkRefusal = 'incompatible' | 'exists' | 'missing' | 'view';

export function refusalOf(plan: LinkPlan): LinkRefusal | undefined {
    if (plan.kind === 'ok') return undefined;
    if (plan.kind === 'exists') return 'exists';
    return plan.reason;
}

/** Tables that can take part in a link: views cannot (EDT-157). */
export function linkableTables(design: Design) {
    return listOf(design.entities).filter((e) => e.kind !== 'view');
}
