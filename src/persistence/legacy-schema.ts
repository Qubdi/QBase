import type Dexie from 'dexie';
import type { Transaction } from 'dexie';
import { upgradeLegacyField, upgradeLegacyRelationship } from './legacy-rows';

/** Names of the nine stores of the old layout. */
export const LEGACY_STORES = [
    'diagrams',
    'db_tables',
    'db_relationships',
    'db_dependencies',
    'areas',
    'db_custom_types',
    'notes',
    'config',
    'diagram_filters',
] as const;

/** The old stores whose rows belong to one diagram (have a `diagramId`). */
export const LEGACY_CHILD_STORES = [
    'db_tables',
    'db_relationships',
    'db_dependencies',
    'areas',
    'db_custom_types',
    'notes',
] as const;

type Stores = Record<string, string | null>;

/**
 * Declares versions 1 to 14 of the old database exactly as data-format 2.2 and
 * 2.3 list them, with their data upgrade steps. Opening an older browser
 * database with this runs the steps in order; opening a current one runs
 * nothing. Dexie stores version N as N x 10, so the browser sees 140.
 * `upTo` stops early; tests use it to build a database as an older editor left it.
 */
export function declareLegacyVersions(db: Dexie, upTo = 14): void {
    const declare = (
        version: number,
        stores: Stores,
        step?: (tx: Transaction) => Promise<unknown>
    ) => {
        if (version > upTo) return;
        const v = db.version(version).stores(stores);
        if (step) v.upgrade(step);
    };

    declare(1, {
        diagrams: '++id, name, databaseType, createdAt, updatedAt',
        db_tables:
            '++id, diagramId, name, x, y, fields, indexes, color, createdAt, width',
        db_relationships:
            '++id, diagramId, name, sourceTableId, targetTableId, sourceFieldId, targetFieldId, type, createdAt',
        config: '++id, defaultDiagramId',
    });
    declare(2, {}, (tx) =>
        tx
            .table('db_tables')
            .toCollection()
            .modify((table) => {
                if (Array.isArray(table.fields))
                    table.fields = table.fields.map(upgradeLegacyField);
            })
    );
    declare(3, {
        diagrams:
            '++id, name, databaseType, databaseEdition, createdAt, updatedAt',
    });
    declare(4, {
        db_tables:
            '++id, diagramId, name, x, y, fields, indexes, color, createdAt, width, comment',
    });
    declare(5, {
        db_tables:
            '++id, diagramId, name, schema, x, y, fields, indexes, color, createdAt, width, comment',
        db_relationships:
            '++id, diagramId, name, sourceSchema, sourceTableId, targetSchema, targetTableId, sourceFieldId, targetFieldId, type, createdAt',
    });
    declare(6, {}, (tx) =>
        tx
            .table('db_relationships')
            .toCollection()
            .modify((rel) => {
                Object.assign(rel, upgradeLegacyRelationship(rel));
                delete rel.type;
            })
    );
    declare(7, {
        db_dependencies:
            '++id, diagramId, schema, tableId, dependentSchema, dependentTableId, createdAt',
    });
    declare(8, {
        db_tables:
            '++id, diagramId, name, schema, x, y, fields, indexes, color, createdAt, width, comment, isView, isMaterializedView, order',
    });
    declare(9, {}, (tx) =>
        tx
            .table('db_tables')
            .toCollection()
            .modify((table) => {
                if (Array.isArray(table.fields))
                    table.fields = table.fields.map(upgradeLegacyField);
            })
    );
    declare(10, { areas: '++id, diagramId, name, x, y, width, height, color' });
    declare(11, {
        db_custom_types: '++id, diagramId, schema, type, kind, values, fields',
    });
    declare(12, { diagram_filters: 'diagramId, tableIds, schemasIds' }, (tx) =>
        tx.table('config').clear()
    );
    declare(13, {
        notes: '++id, diagramId, content, x, y, width, height, color',
    });
    declare(14, {}, (tx) =>
        tx
            .table('db_relationships')
            .toCollection()
            .modify((rel) => {
                if (
                    rel.sourceCardinality === 'many' &&
                    rel.targetCardinality === 'many'
                )
                    rel.sourceCardinality = 'one';
            })
    );
}
