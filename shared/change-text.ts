import type {
    Change,
    ChangeKind,
    FieldChange,
    PossibleRename,
} from './reconcile.js';

const show = (v: unknown): string =>
    v === null || v === undefined || v === '' ? 'none' : String(v);

const fieldText = (f: FieldChange): string => {
    switch (f.field) {
        case 'type':
            return `type ${show(f.from)} → ${show(f.to)}`;
        case 'nullable':
            return `${f.to ? 'now nullable' : 'now NOT NULL'}`;
        case 'primaryKey':
            return f.to ? 'now primary key' : 'no longer primary key';
        case 'unique':
            return f.to ? 'now unique' : 'no longer unique';
        case 'identity':
            return f.to ? 'now auto-increment' : 'no longer auto-increment';
        case 'default':
            return `default ${show(f.from)} → ${show(f.to)}`;
        case 'length':
            return `length ${show(f.from)} → ${show(f.to)}`;
        case 'precision':
            return `precision ${show(f.from)} → ${show(f.to)}`;
        case 'scale':
            return `scale ${show(f.from)} → ${show(f.to)}`;
        case 'comment':
            return 'description changed';
    }
};

const cols = (c: string[]) => c.join(', ');

/** One readable line per change, for the re-sync checklist and drift reports. */
export function describeChange(c: Change): string {
    switch (c.kind) {
        case 'table_added':
            return `Add ${c.table.isView ? 'view' : 'table'} ${c.table.key}`;
        case 'table_removed':
            return `Remove ${c.table.isView ? 'view' : 'table'} ${c.table.key}`;
        case 'table_comment_changed':
            return `Change description of ${c.tableKey}`;
        case 'column_added':
            return `Add column ${c.tableKey}.${c.column.name} (${c.column.type})`;
        case 'column_removed':
            return `Remove column ${c.tableKey}.${c.column.name}`;
        case 'column_changed':
            return `Change column ${c.tableKey}.${c.before.name}: ${c.changes.map(fieldText).join(', ')}`;
        case 'index_added':
            return `Add ${c.index.unique ? 'unique ' : ''}index ${c.index.name} on ${c.tableKey} (${cols(c.index.columns)})`;
        case 'index_removed':
            return `Remove ${c.index.unique ? 'unique ' : ''}index ${c.index.name} on ${c.tableKey} (${cols(c.index.columns)})`;
        case 'relationship_added':
            return `Add relationship ${c.relationship.name}: ${c.relationship.fromTable}(${cols(c.relationship.fromColumns)}) → ${c.relationship.toTable}(${cols(c.relationship.toColumns)})`;
        case 'relationship_removed':
            return `Remove relationship ${c.relationship.name}: ${c.relationship.fromTable}(${cols(c.relationship.fromColumns)}) → ${c.relationship.toTable}(${cols(c.relationship.toColumns)})`;
        case 'relationship_changed':
            return `Change relationship ${c.after.name}: now ${c.after.fromTable}(${cols(c.after.fromColumns)}) → ${c.after.toTable}(${cols(c.after.toColumns)})`;
    }
}

export function describeRename(r: PossibleRename): string {
    return r.entity === 'table'
        ? `Rename table ${r.from} → ${r.to} (keeps position, colour and relationships)`
        : `Rename column ${r.tableKey}.${r.from} → ${r.to}`;
}

/** Display group, in the order the checklist shows them. */
export type ChangeGroup = 'Tables' | 'Columns' | 'Indexes' | 'Relationships';

export const GROUP_ORDER: ChangeGroup[] = [
    'Tables',
    'Columns',
    'Indexes',
    'Relationships',
];

export function groupOf(kind: ChangeKind): ChangeGroup {
    if (kind.startsWith('table_')) return 'Tables';
    if (kind.startsWith('column_')) return 'Columns';
    if (kind.startsWith('index_')) return 'Indexes';
    return 'Relationships';
}

export function groupChanges(changes: Change[]): Array<{
    group: ChangeGroup;
    changes: Change[];
}> {
    return GROUP_ORDER.map((group) => ({
        group,
        changes: changes.filter((c) => groupOf(c.kind) === group),
    })).filter((g) => g.changes.length > 0);
}
