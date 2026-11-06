import { loadFromDatabaseMetadata } from '@/lib/data/import-metadata/import';
import { createRelationshipsFromMetadata } from '@/lib/data/import-metadata/import/relationships';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import {
    type DBField,
    type DBTable,
    type Diagram,
} from '@/qbase/diagram-types';
import {
    reconcile,
    type Change,
    type ChangeSet,
    type FieldChange,
    type PossibleRename,
} from '../../../shared/reconcile';
import {
    diagramToDesc,
    metadataToDesc,
    type TableDesc,
} from '../../../shared/schema-desc';
import { dialectToDatabaseType, type ServerDialect } from './import-from-db';
import { estimateBox, findFreeSpot, type Box } from './placement';
import type { SyncState } from './sync-state';

type SourceKeys = SyncState['sourceKeys'];

/** Which diagram changes would bring it in line with the database? Pure. */
export function planResync(
    diagram: Diagram,
    metadata: DatabaseMetadata,
    sourceKeys?: SourceKeys
): ChangeSet {
    return reconcile(diagramToDesc(diagram), metadataToDesc(metadata), {
        sourceKeys,
        // descriptions written in the diagram are kept, never "synced away"
        ignoreComments: true,
    });
}

export interface EffectiveSelection {
    renames: PossibleRename[];
    changes: Change[];
}

const supersededBy = (r: PossibleRename): string[] =>
    r.entity === 'table'
        ? [`table_removed:${r.from}`, `table_added:${r.to}`]
        : [
              `column_removed:${r.tableKey}.${r.from}`,
              `column_added:${r.tableKey}.${r.to}`,
          ];

/**
 * Turns the user's checkboxes into what will actually run. Accepting a rename
 * replaces the matching removed+added pair and brings the follow-up changes
 * that only make sense for the renamed object.
 */
export function effectiveSelection(
    cs: ChangeSet,
    selected: ReadonlySet<string>
): EffectiveSelection {
    const renames = cs.possibleRenames.filter((r) => selected.has(r.id));
    const superseded = new Set(renames.flatMap(supersededBy));
    const direct = cs.changes.filter(
        (c) => selected.has(c.id) && !superseded.has(c.id)
    );
    const follow = renames.flatMap((r) => r.followUps);
    const seen = new Set<string>();
    const changes = [...direct, ...follow].filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });
    return { renames, changes };
}

const clone = <T>(x: T): T => structuredClone(x);
const lc = (s: string) => s.toLowerCase();
const indexSig = (unique: boolean, columns: string[]) =>
    `${unique ? 'u' : 'n'}|${columns.map(lc).join(',')}`;

/**
 * Applies the selected changes. Everything the changes do not touch (table
 * positions, colours, areas, notes, comments, descriptions) is preserved.
 */
export async function applyResync(
    diagram: Diagram,
    metadata: DatabaseMetadata,
    dialect: ServerDialect,
    cs: ChangeSet,
    selected: ReadonlySet<string>
): Promise<Diagram> {
    const { renames, changes } = effectiveSelection(cs, selected);
    const next = clone(diagram);
    let tables: DBTable[] = next.tables ?? [];
    let relationships = next.relationships ?? [];
    let dependencies = next.dependencies ?? [];

    const fresh = await loadFromDatabaseMetadata({
        databaseType: dialectToDatabaseType(dialect),
        databaseMetadata: metadata,
    });
    const freshDesc = diagramToDesc(fresh);
    const freshByKey = new Map(
        freshDesc.tables.map((t) => [
            t.key,
            fresh.tables!.find((x) => x.id === t.id)!,
        ])
    );
    const dbDesc = metadataToDesc(metadata);
    const dbTables = new Map(dbDesc.tables.map((t) => [t.key, t]));

    // diagram key -> table id, and table id -> database key, before anything changes
    const before = diagramToDesc(diagram);
    const idByKey = new Map(before.tables.map((t) => [t.key, t.id!]));
    const dbKeyById = new Map(cs.matched.map((m) => [m.diagramId!, m.dbKey]));

    const byId = (id: string) => tables.find((t) => t.id === id);
    const tableOf = (diagramKey: string) => {
        const id = idByKey.get(diagramKey);
        return id ? byId(id) : undefined;
    };
    const freshOf = (t: DBTable) => {
        const dbKey = dbKeyById.get(t.id);
        return dbKey ? freshByKey.get(dbKey) : undefined;
    };

    // 1. renames first, so later changes find objects under their new names
    for (const r of renames) {
        const t = tableOf(r.entity === 'table' ? r.from : r.tableKey);
        if (!t) continue;
        if (r.entity === 'table') {
            const target = dbTables.get(r.to);
            if (!target) continue;
            t.name = target.name;
            t.schema = target.schema || t.schema;
            dbKeyById.set(t.id, r.to);
        } else {
            const f = t.fields.find((x) => lc(x.name) === lc(r.from));
            if (f) f.name = r.to;
        }
    }

    // 2. tables
    const occupied = (): Box[] => tables.map(estimateBox);
    for (const c of changes) {
        if (c.kind === 'table_removed') {
            const id = idByKey.get(c.table.key);
            if (!id) continue;
            tables = tables.filter((t) => t.id !== id);
            relationships = relationships.filter(
                (r) => r.sourceTableId !== id && r.targetTableId !== id
            );
            dependencies = dependencies.filter(
                (d) => d.tableId !== id && d.dependentTableId !== id
            );
        }
        if (c.kind === 'table_comment_changed') {
            const t = tableOf(c.tableKey);
            if (t) t.comments = c.to ?? undefined;
        }
    }
    for (const c of changes) {
        if (c.kind !== 'table_added') continue;
        const source = freshByKey.get(c.table.key);
        if (!source) continue;
        const created = clone(source);
        // anchor on tables this one has foreign keys with
        const relatedKeys = dbDesc.relationships
            .filter(
                (r) => r.fromTable === c.table.key || r.toTable === c.table.key
            )
            .map((r) =>
                r.fromTable === c.table.key ? r.toTable : r.fromTable
            );
        const anchors = tables
            .filter((t) => relatedKeys.includes(dbKeyById.get(t.id) ?? ''))
            .map(estimateBox);
        const box = estimateBox(created);
        const spot = findFreeSpot(box, anchors, occupied());
        created.x = spot.x;
        created.y = spot.y;
        tables = [...tables, created];
        dbKeyById.set(created.id, c.table.key);
    }

    // 3. columns and indexes
    for (const c of changes) {
        if (
            c.kind !== 'column_added' &&
            c.kind !== 'column_removed' &&
            c.kind !== 'column_changed' &&
            c.kind !== 'index_added' &&
            c.kind !== 'index_removed'
        ) {
            continue;
        }
        const t = tableOf(c.tableKey);
        if (!t) continue;

        if (c.kind === 'column_added') {
            const source = freshOf(t)?.fields.find(
                (f) => lc(f.name) === lc(c.column.name)
            );
            if (
                !source ||
                t.fields.some((f) => lc(f.name) === lc(c.column.name))
            )
                continue;
            const order =
                dbTables
                    .get(dbKeyById.get(t.id) ?? '')
                    ?.columns.map((x) => lc(x.name)) ?? [];
            const position = order.indexOf(lc(c.column.name));
            const later = t.fields.findIndex((f) => {
                const p = order.indexOf(lc(f.name));
                return p > position && position >= 0;
            });
            const created = clone(source);
            if (later >= 0) t.fields.splice(later, 0, created);
            else t.fields.push(created);
        }

        if (c.kind === 'column_removed') {
            const field = t.fields.find((f) =>
                c.column.id
                    ? f.id === c.column.id
                    : lc(f.name) === lc(c.column.name)
            );
            if (!field) continue;
            t.fields = t.fields.filter((f) => f.id !== field.id);
            t.indexes = t.indexes
                .map((ix) => ({
                    ...ix,
                    fieldIds: ix.fieldIds.filter((id) => id !== field.id),
                }))
                .filter((ix) => ix.fieldIds.length > 0);
            relationships = relationships.filter(
                (r) =>
                    r.sourceFieldId !== field.id && r.targetFieldId !== field.id
            );
        }

        if (c.kind === 'column_changed') {
            const field = t.fields.find((f) =>
                c.before.id
                    ? f.id === c.before.id
                    : lc(f.name) === lc(c.before.name)
            );
            const source = freshOf(t)?.fields.find(
                (f) => lc(f.name) === lc(c.after.name)
            );
            if (field && source) copyAttributes(field, source, c.changes);
        }

        if (c.kind === 'index_added') {
            const source = freshOf(t);
            const wanted = indexSig(c.index.unique, c.index.columns);
            const ix = source?.indexes.find(
                (i) =>
                    indexSig(
                        i.unique,
                        i.fieldIds.map(
                            (id) =>
                                source.fields.find((f) => f.id === id)?.name ??
                                ''
                        )
                    ) === wanted
            );
            if (!source || !ix) continue;
            const fieldIds = ix.fieldIds
                .map((id) => source.fields.find((f) => f.id === id)?.name)
                .map(
                    (name) =>
                        t.fields.find((f) => lc(f.name) === lc(name ?? ''))?.id
                )
                .filter((id): id is string => Boolean(id));
            if (fieldIds.length === ix.fieldIds.length) {
                t.indexes = [...t.indexes, { ...clone(ix), fieldIds }];
            }
        }

        if (c.kind === 'index_removed') {
            t.indexes = t.indexes.filter((ix) => ix.id !== c.index.id);
        }
    }

    // 4. relationships, resolved against the database's names
    const lookupTables: DBTable[] = tables.map((t) => {
        const target = dbTables.get(dbKeyById.get(t.id) ?? '');
        return target ? { ...t, name: target.name, schema: target.schema } : t;
    });
    const addRelationship = (key: string, name: string, fromColumn: string) => {
        const rows = metadata.fk_info.filter(
            (f) =>
                `${f.schema}.${f.table}` === key &&
                f.foreign_key_name === name &&
                f.column === fromColumn
        );
        for (const rel of createRelationshipsFromMetadata({
            foreignKeys: rows,
            tables: lookupTables,
        })) {
            const dup = relationships.some(
                (r) =>
                    r.sourceFieldId === rel.sourceFieldId &&
                    r.targetFieldId === rel.targetFieldId
            );
            if (!dup) relationships = [...relationships, rel];
        }
    };
    for (const c of changes) {
        if (c.kind === 'relationship_removed' && c.relationship.id) {
            relationships = relationships.filter(
                (r) => r.id !== c.relationship.id
            );
        }
        if (c.kind === 'relationship_changed' && c.before.id) {
            relationships = relationships.filter((r) => r.id !== c.before.id);
        }
    }
    for (const c of changes) {
        if (c.kind === 'relationship_added') {
            addRelationship(
                c.relationship.fromTable,
                c.relationship.name,
                c.relationship.fromColumns[0]
            );
        }
        if (c.kind === 'relationship_changed') {
            addRelationship(
                c.after.fromTable,
                c.after.name,
                c.after.fromColumns[0]
            );
        }
    }

    return {
        ...next,
        tables,
        relationships,
        dependencies,
        updatedAt: new Date(),
    };
}

function copyAttributes(
    target: DBField,
    source: DBField,
    changes: FieldChange[]
) {
    const t = target as unknown as Record<string, unknown>;
    const s = source as unknown as Record<string, unknown>;
    const set = (key: string) => {
        if (s[key] === undefined) delete t[key];
        else t[key] = clone(s[key]);
    };
    for (const { field } of changes) {
        switch (field) {
            case 'type':
                target.type = clone(source.type);
                break;
            case 'nullable':
            case 'primaryKey':
            case 'unique':
            case 'default':
            case 'precision':
            case 'scale':
                set(field);
                break;
            case 'length':
                set('characterMaximumLength');
                break;
            case 'identity':
                set('increment');
                break;
            case 'comment':
                set('comments');
                break;
        }
    }
}

/**
 * Remembers, per diagram object, the name it has in the database right now.
 * This is the stored identity that lets the next sync recognise an object
 * even if it was renamed in the diagram.
 */
export function snapshotSourceKeys(
    diagram: Diagram,
    metadata: DatabaseMetadata,
    previous?: SourceKeys
): SourceKeys {
    const dDesc = diagramToDesc(diagram);
    const mDesc = metadataToDesc(metadata);
    const cs = reconcile(dDesc, mDesc, {
        sourceKeys: previous,
        ignoreComments: true,
    });
    const dbByKey = new Map(mDesc.tables.map((t) => [t.key, t]));
    const dByKey = new Map(dDesc.tables.map((t) => [t.key, t]));

    const tables: Record<string, string> = {};
    const columns: Record<string, string> = {};
    for (const m of cs.matched) {
        const d = dByKey.get(m.diagramKey) as TableDesc;
        const db = dbByKey.get(m.dbKey) as TableDesc;
        if (d.id) tables[d.id] = m.dbKey;
        for (const col of d.columns) {
            if (!col.id) continue;
            const stored = previous?.columns[col.id];
            const hit =
                db.columns.find((x) => stored && lc(x.name) === lc(stored)) ??
                db.columns.find((x) => lc(x.name) === lc(col.name));
            if (hit) columns[col.id] = hit.name;
        }
    }
    return { tables, columns };
}
