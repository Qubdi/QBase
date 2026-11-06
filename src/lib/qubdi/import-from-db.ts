import { loadFromDatabaseMetadata } from '@/lib/data/import-metadata/import';
import {
    DatabaseMetadataSchema,
    type DatabaseMetadata,
} from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { i18n } from '@/i18n/i18n';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

export type ServerDialect = 'postgresql' | 'sqlserver';

export interface CatalogSchema {
    schema: string;
    tables: string[];
    views: string[];
}

export const dialectToDatabaseType = (d: ServerDialect): DatabaseType =>
    d === 'postgresql' ? DatabaseType.POSTGRESQL : DatabaseType.SQL_SERVER;

/** "schema.table", the id the server uses for table selection. */
export const tableKey = (schema: string, table: string) => `${schema}.${table}`;

export function allTableKeys(catalog: CatalogSchema[]): string[] {
    return catalog.flatMap((s) => [
        ...s.tables.map((t) => tableKey(s.schema, t)),
        ...s.views.map((v) => tableKey(s.schema, v)),
    ]);
}

export interface SelectionSummary {
    schemas: string[];
    tables: number;
    views: number;
}

/** What the wizard's preview step shows before anything is created. */
export function summarizeSelection(
    catalog: CatalogSchema[],
    selected: ReadonlySet<string>
): SelectionSummary {
    const schemas = new Set<string>();
    let tables = 0;
    let views = 0;
    for (const s of catalog) {
        for (const t of s.tables) {
            if (selected.has(tableKey(s.schema, t))) {
                tables++;
                schemas.add(s.schema);
            }
        }
        for (const v of s.views) {
            if (selected.has(tableKey(s.schema, v))) {
                views++;
                schemas.add(s.schema);
            }
        }
    }
    return { schemas: [...schemas].sort(), tables, views };
}

/** Schemas that must be requested so that every selected object is read. */
export const schemasOfSelection = (selected: ReadonlySet<string>): string[] =>
    [...new Set([...selected].map((k) => k.slice(0, k.indexOf('.'))))].sort();

/**
 * Turns server metadata into a QBase diagram using QBase's own importer,
 * so type mapping, layout and relationships match a manual import.
 */
export async function metadataToDiagram(
    dialect: ServerDialect,
    metadata: unknown,
    name: string
): Promise<Diagram> {
    const parsed = DatabaseMetadataSchema.safeParse(metadata);
    if (!parsed.success) {
        throw new Error(i18n.t('qubdi.database.importFromDb.badMetadata'));
    }
    const diagram = await loadFromDatabaseMetadata({
        databaseType: dialectToDatabaseType(dialect),
        databaseMetadata: parsed.data as DatabaseMetadata,
    });
    return { ...diagram, name };
}
