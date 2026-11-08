import { removeItem } from '@/core/model/collection';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { isVisible } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { convertDesign } from '@/dialects/convert/engine';
import { pairHeader, writeGenericSql } from '@/dialects/generic/write';
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

/** What the target's own writer cannot say: MySQL and MariaDB have no partial indexes. */
function unkeptByWriter(
    design: Design,
    targetFamily: DatabaseType
): Diagnostic[] {
    if (targetFamily !== 'mysql') return [];
    const out: Diagnostic[] = [];
    for (const id of design.entities.order)
        for (const keyId of design.entities.byId[id].keyIds) {
            const key = design.keys[keyId];
            if (!key?.where) continue;
            out.push({
                severity: 'warning',
                message: `Index ${key.label || '(unnamed)'}: MySQL has no partial indexes, so its WHERE condition was left out.`,
            });
        }
    return out;
}

/**
 * SQL for a design in the target's dialect (EXP-001 to EXP-012). The same
 * family writes with the target's own generator; another family goes
 * through the converter; a pair with no converter uses the generic generator (EXP-008); ids without a writer give a clear error.
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
        return {
            text: target.sql.write(filtered),
            diagnostics: unkeptByWriter(filtered, family(targetId)),
        };
    // a pair with no converter (Oracle and ClickHouse on either side) gets the
    // generic generator and a warning that the types are copied as written
    if (!target.sql.target || (!source.sql.source && source.id !== 'generic'))
        return {
            text: writeGenericSql(filtered, {
                capabilities: target.capabilities,
                header: pairHeader(
                    source.id === 'generic' ? 'generic SQL' : source.label,
                    target.label
                ),
                spelling: target.types,
            }),
            diagnostics: genericDiagnostics(filtered),
        };
    return convertDesign(filtered, source, target);
}

/** What the generic generator leaves out. */
function genericDiagnostics(design: Design): Diagnostic[] {
    const views = design.entities.order.filter(
        (id) => design.entities.byId[id].kind === 'view'
    ).length;
    return views === 0
        ? []
        : [
              {
                  severity: 'warning',
                  message: `${views} view${views === 1 ? '' : 's'} not exported: only tables are written.`,
              },
          ];
}
