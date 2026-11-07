import { removeItem } from '@/core/model/collection';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { isVisible } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { convertDesign } from '@/dialects/convert/engine';
import { dialectFor } from '@/dialects/registry';
import type { Diagnostic } from '@/dialects/script-model';
import { error } from './diagnostics';

export interface SqlExportResult {
    text: string;
    diagnostics: Diagnostic[];
}

export interface SqlExportOptions {
    /** the diagram filter: only what it shows is exported (EXP-002) */
    filter?: VisibilityFilter;
}

/** Keeps the entities the filter shows and the links between them. */
export function applyFilter(
    design: Design,
    filter: VisibilityFilter | undefined,
    defaultSchema?: string
): Design {
    if (!filter) return design;
    let next = design;
    const hidden = design.entities.order.filter(
        (id) => !isVisible(filter, design.entities.byId[id], defaultSchema)
    );
    if (hidden.length === 0) return design;
    const gone = new Set(hidden);
    const entities = { ...next.entities, byId: { ...next.entities.byId } };
    for (const id of hidden) {
        delete entities.byId[id];
    }
    next = {
        ...next,
        entities: {
            byId: entities.byId,
            order: next.entities.order.filter((id) => !gone.has(id)),
        },
    };
    for (const id of design.links.order) {
        const l = design.links.byId[id];
        if (gone.has(l.sourceEntityId) || gone.has(l.targetEntityId))
            next = { ...next, links: removeItem(next.links, id) };
    }
    return next;
}

const family = (id: DatabaseType): DatabaseType =>
    dialectFor(id).variantOf ?? id;

/**
 * SQL for a design in the target's dialect (EXP-001 to EXP-012). The same
 * family writes with the target's own generator; another family goes
 * through the converter; ids without a writer give a clear error (EXP-008).
 */
export function exportSql(
    design: Design,
    targetId: DatabaseType,
    options: SqlExportOptions = {}
): SqlExportResult {
    const target = dialectFor(targetId);
    const source = dialectFor(design.databaseType);
    if (!target.sql.write)
        return {
            text: '',
            diagnostics: [
                error(`SQL export is not supported for ${target.label}`),
            ],
        };
    if (!source.sql.write && design.databaseType !== 'generic')
        return {
            text: '',
            diagnostics: [
                error(
                    `SQL export is not supported for ${source.label} diagrams`
                ),
            ],
        };
    const filtered = applyFilter(design, options.filter, source.defaultSchema);
    if (
        !filtered.entities.order.some(
            (id) => filtered.entities.byId[id].kind === 'table'
        )
    )
        return { text: '', diagnostics: [error('Nothing to export')] };
    if (
        design.databaseType !== 'generic' &&
        family(design.databaseType) === family(targetId)
    )
        return { text: target.sql.write(filtered), diagnostics: [] };
    return convertDesign(filtered, source, target);
}
