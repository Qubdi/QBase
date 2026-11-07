import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { dialectFor } from '@/dialects/registry';
import type { Diagnostic } from '@/dialects/script-model';
import { importDbml } from '@/formats/dbml/import-dbml';
import { loadFromDatabaseMetadata } from '@/formats/metadata/load';
import {
    parseMetadataText,
    repairMetadataText,
    selectMetadata,
} from '@/formats/metadata/repair-text';
import { importSql } from '@/formats/sql/import-sql';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { ImportMethod } from './import-method';

/** What the person sees about the text in the box. */
export interface Analysis {
    diagnostics: Diagnostic[];
    /** the design the text would make; undefined when blocked or empty */
    design?: Design;
    /** metadata only: the parsed document, kept so a table picker can narrow it */
    metadata?: DatabaseMetadata;
    counts: { tables: number; views: number; relationships: number };
    /** true when an error blocks the import */
    blocked: boolean;
    /** true when a repair button can help */
    fixable: boolean;
}

export const EMPTY_COUNTS = { tables: 0, views: 0, relationships: 0 };

const error = (message: string): Diagnostic => ({ severity: 'error', message });

export interface AnalyzeOptions {
    method: ImportMethod;
    databaseType: DatabaseType;
    edition?: DatabaseEdition;
    /** names the new diagram when the text brings none */
    diagramName?: string;
    /** metadata: keep only these `schema.table` keys */
    selection?: ReadonlySet<string>;
}

const finish = (
    diagnostics: Diagnostic[],
    rest: Partial<Analysis> = {}
): Analysis => ({
    diagnostics,
    counts: EMPTY_COUNTS,
    ...rest,
    blocked: diagnostics.some((d) => d.severity === 'error'),
    fixable: diagnostics.some((d) => d.fixable),
});

/** Reads the text the way the import button would, without changing anything. */
export function analyzeImport(text: string, options: AnalyzeOptions): Analysis {
    if (text.trim() === '') return finish([]);
    const { method, databaseType } = options;
    if (method === 'sql') {
        const result = importSql(text, databaseType, {
            name: options.diagramName,
        });
        return finish(result.diagnostics, {
            design: result.design,
            counts: result.counts,
        });
    }
    if (method === 'dbml') {
        const result = importDbml(text, databaseType, {
            name: options.diagramName,
        });
        return finish(result.diagnostics, {
            design: result.design,
            counts: {
                ...EMPTY_COUNTS,
                tables: result.counts.tables,
                relationships: result.counts.relationships,
            },
        });
    }
    const parsed = parseMetadataText(text);
    if (!parsed.ok) return finish([error(parsed.message)]);
    return finish([], {
        metadata: parsed.metadata,
        ...buildMetadata(parsed.metadata, options),
    });
}

/** Builds the design from parsed metadata, narrowed to the selection when there is one. */
export function buildMetadata(
    metadata: DatabaseMetadata,
    options: Pick<
        AnalyzeOptions,
        'databaseType' | 'edition' | 'diagramName' | 'selection'
    >
): Pick<Analysis, 'design' | 'counts' | 'diagnostics'> {
    const picked = options.selection
        ? selectMetadata(metadata, options.selection)
        : metadata;
    const loaded = loadFromDatabaseMetadata({
        databaseType: options.databaseType,
        databaseMetadata: picked,
        databaseEdition: options.edition,
        fallbackName: options.diagramName,
    });
    const design = loaded.design;
    const views = design.entities.order.filter(
        (id) => design.entities.byId[id].kind === 'view'
    ).length;
    return {
        design,
        diagnostics: loaded.diagnostics,
        counts: {
            tables: design.entities.order.length - views,
            views,
            relationships: design.links.order.length,
        },
    };
}

/** The "repair" button: dialect fixes for SQL, the paste repairs for metadata. */
export function repairText(
    text: string,
    method: ImportMethod,
    databaseType: DatabaseType
): string {
    if (method === 'metadata') return repairMetadataText(text);
    if (method === 'sql') {
        const fix = dialectFor(databaseType).sql.fix;
        return fix ? fix(text) : text;
    }
    return text;
}

/** The first three problems as lines, then "N more" (IMP-010). */
export function listProblems(
    diagnostics: readonly Diagnostic[],
    limit = 3
): { shown: Diagnostic[]; more: number } {
    const errors = diagnostics.filter((d) => d.severity === 'error');
    return {
        shown: errors.slice(0, limit),
        more: Math.max(0, errors.length - limit),
    };
}
