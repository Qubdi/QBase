import { describeChange } from './change-text.js';
import type { Change, PossibleRename } from './reconcile.js';

// Drift detection reports how a live database differs from a diagram. This
// file decides how serious each difference is. Pure and dependency-free.

export type Severity = 'breaking' | 'warning' | 'info';

/**
 * Where the two sides disagree:
 *  - only_in_database: the database has it, the diagram does not
 *  - only_in_diagram: the diagram has it, the database does not
 *  - differs: both have it, but the definitions differ
 */
export type DriftCategory = 'only_in_database' | 'only_in_diagram' | 'differs';

export interface Classification {
    category: DriftCategory;
    severity: Severity;
}

export function classifyChange(c: Change): Classification {
    switch (c.kind) {
        case 'table_added':
            return { category: 'only_in_database', severity: 'info' };
        case 'table_removed':
            // the table is gone from the database but code may still use it
            return { category: 'only_in_diagram', severity: 'breaking' };
        case 'table_comment_changed':
            return { category: 'differs', severity: 'info' };
        case 'column_added': {
            const col = c.column;
            // a required column without a default breaks every existing writer
            const required =
                !col.nullable && col.default === null && !col.identity;
            return {
                category: 'only_in_database',
                severity: required ? 'breaking' : 'warning',
            };
        }
        case 'column_removed':
            return { category: 'only_in_diagram', severity: 'breaking' };
        case 'column_changed': {
            const fields = c.changes.map((f) => f.field);
            if (fields.includes('type')) {
                return { category: 'differs', severity: 'breaking' };
            }
            const onlyMinor = fields.every(
                (f) => f === 'comment' || f === 'default'
            );
            return {
                category: 'differs',
                severity: onlyMinor ? 'info' : 'warning',
            };
        }
        case 'index_added':
            return { category: 'only_in_database', severity: 'info' };
        case 'index_removed':
            return {
                category: 'only_in_diagram',
                severity: c.index.unique ? 'warning' : 'info',
            };
        case 'relationship_added':
            return { category: 'only_in_database', severity: 'info' };
        case 'relationship_removed':
            return { category: 'only_in_diagram', severity: 'warning' };
        case 'relationship_changed':
            return { category: 'differs', severity: 'warning' };
    }
}

export interface DriftItem {
    id: string;
    kind: Change['kind'];
    category: DriftCategory;
    severity: Severity;
    summary: string;
    change: Change;
}

const SEVERITY_RANK: Record<Severity, number> = {
    breaking: 0,
    warning: 1,
    info: 2,
};

/** Classified, most serious first, stable within a severity. */
export function toDriftItems(changes: Change[]): DriftItem[] {
    return changes
        .map((change) => ({
            id: change.id,
            kind: change.kind,
            ...classifyChange(change),
            summary: describeChange(change),
            change,
        }))
        .sort(
            (a, b) =>
                SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
                a.id.localeCompare(b.id)
        );
}

export type SeverityCounts = Record<Severity, number>;

export function countBySeverity(
    items: Array<{ severity: Severity }>
): SeverityCounts {
    const counts: SeverityCounts = { breaking: 0, warning: 0, info: 0 };
    for (const i of items) counts[i.severity] += 1;
    return counts;
}

export function worstSeverity(
    items: Array<{ severity: Severity }>
): Severity | null {
    if (items.length === 0) return null;
    return items.reduce<Severity>(
        (worst, i) =>
            SEVERITY_RANK[i.severity] < SEVERITY_RANK[worst]
                ? i.severity
                : worst,
        'info'
    );
}

/**
 * Identifies a particular set of differences. Two runs with the same signature
 * found the same drift, so a notification is not repeated and a dismissal
 * stays dismissed.
 */
export function driftSignature(
    items: Array<{ id: string; severity: Severity }>
): string {
    return items
        .map((i) => `${i.severity[0]}:${i.id}`)
        .sort()
        .join('|');
}

export function renameHints(renames: PossibleRename[]): string[] {
    return renames.map((r) =>
        r.entity === 'table'
            ? `${r.from} may have been renamed to ${r.to}`
            : `${r.tableKey}.${r.from} may have been renamed to ${r.to}`
    );
}
