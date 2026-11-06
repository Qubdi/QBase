import { exportSql } from '@/formats/sql/export-sql';
import type { Diagnostic } from '@/dialects/script-model';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { diagramToDesign } from './diagram-convert';
import type { DatabaseType, Diagram } from './diagram-types';

export interface BaseSqlResult {
    text: string;
    diagnostics: Diagnostic[];
}

/**
 * SQL for a wire-shaped diagram in a target dialect: reads the diagram into
 * the model and hands it to the SQL writer of `@/formats/sql`.
 */
export function exportDiagramSql(options: {
    diagram: Diagram;
    targetDatabaseType: DatabaseType;
    filter?: VisibilityFilter;
}): BaseSqlResult {
    const { design } = diagramToDesign(options.diagram);
    return exportSql(design, options.targetDatabaseType, {
        filter: options.filter,
    });
}
