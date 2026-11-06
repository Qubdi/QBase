import { newId } from '@/core/model/ids';
import { cardinalityOf } from '@/formats/shared/cardinality';
import { loadFromDatabaseMetadata as loadDesign } from '@/formats/metadata/load';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { designToDiagram } from './diagram-convert';
import type {
    DatabaseEdition,
    DatabaseType,
    DBRelationship,
    DBTable,
    Diagram,
} from './diagram-types';

const blank = (schema: string | null | undefined): string =>
    schema && schema.trim() !== '' ? schema : '';

/**
 * The wire-shaped counterpart of `@/formats/metadata/load`: QBase code
 * (import from a database, re-sync) works on saved-diagram shapes, so the
 * loaded design is projected to one (spec C17).
 */
export function loadFromDatabaseMetadata(options: {
    databaseType: DatabaseType;
    databaseMetadata: DatabaseMetadata;
    diagramNumber?: number;
    databaseEdition?: DatabaseEdition;
}): Diagram {
    const { design } = loadDesign({
        databaseType: options.databaseType,
        databaseMetadata: options.databaseMetadata,
        databaseEdition: options.databaseEdition,
        fallbackName: `Diagram ${options.diagramNumber ?? 1}`,
    });
    const diagram = designToDiagram(design);
    return {
        ...diagram,
        tables: markUniqueColumns(diagram, options.databaseMetadata),
    };
}

/**
 * A column that a single-column unique index covers is saved as `unique`,
 * the primary key's own index included: that is what re-sync compares with
 * and what diagrams imported by earlier versions hold.
 */
function markUniqueColumns(
    diagram: Diagram,
    metadata: DatabaseMetadata
): DBTable[] {
    const byIndex = new Map<string, { columns: string[]; unique: boolean }>();
    for (const row of metadata.indexes) {
        const key = `${blank(row.schema)}\u0000${row.table}\u0000${row.name}`;
        const found = byIndex.get(key) ?? {
            columns: [],
            unique: row.unique === true || row.unique === 1,
        };
        found.columns.push(row.column);
        byIndex.set(key, found);
    }
    const unique = new Set<string>();
    for (const [key, index] of byIndex) {
        if (!index.unique || index.columns.length !== 1) continue;
        const [schema, table] = key.split('\u0000');
        unique.add(`${schema}\u0000${table}\u0000${index.columns[0]}`);
    }
    return (diagram.tables ?? []).map((t) => ({
        ...t,
        fields: t.fields.map((f) =>
            unique.has(`${blank(t.schema)}\u0000${t.name}\u0000${f.name}`)
                ? { ...f, unique: true }
                : f
        ),
    }));
}

/**
 * One relationship per foreign-key row between tables the diagram already has
 * (spec C18). The referenced side is the source; rows that name an unknown
 * table or column are skipped.
 */
export function createRelationshipsFromMetadata(options: {
    foreignKeys: DatabaseMetadata['fk_info'];
    tables: DBTable[];
}): DBRelationship[] {
    const find = (schema: string, name: string) =>
        options.tables.find(
            (t) => t.name === name && blank(t.schema) === blank(schema)
        );
    const out: DBRelationship[] = [];
    for (const fk of options.foreignKeys) {
        const holder = find(fk.schema, fk.table);
        const referenced = find(
            fk.reference_schema ?? fk.schema,
            fk.reference_table
        );
        const to = holder?.fields.find((f) => f.name === fk.column);
        const from = referenced?.fields.find(
            (f) => f.name === fk.reference_column
        );
        if (!holder || !referenced || !to || !from) continue;
        const identifies = (t: DBTable, id: string, unique: boolean) =>
            unique ||
            (t.fields.filter((f) => f.primaryKey).length === 1 &&
                t.fields.some((f) => f.id === id && f.primaryKey));
        const card = cardinalityOf(
            { identifiesRow: identifies(referenced, from.id, from.unique) },
            { identifiesRow: identifies(holder, to.id, to.unique) }
        );
        out.push({
            id: newId(),
            name: fk.foreign_key_name,
            sourceTableId: referenced.id,
            sourceFieldId: from.id,
            sourceSchema: referenced.schema,
            sourceCardinality: card.source,
            targetTableId: holder.id,
            targetFieldId: to.id,
            targetSchema: holder.schema,
            targetCardinality: card.target,
            createdAt: Date.now(),
        });
    }
    return out;
}
