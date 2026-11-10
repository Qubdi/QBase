import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { isVisible } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import { convertDesign } from '@/dialects/convert/engine';
import { dialectFor } from '@/dialects/registry';
import type { Diagnostic } from '@/dialects/script-model';
import { error } from './diagnostics';
import { unsafeText } from './unsafe-text';

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
    // one pass over the links: removing them one at a time copies the whole
    // collection for each (quadratic for a diagram with many hidden links)
    const dropped = new Set(
        design.links.order.filter((id) => {
            const l = design.links.byId[id];
            return gone.has(l.sourceEntityId) || gone.has(l.targetEntityId);
        })
    );
    if (dropped.size > 0) {
        const byId = { ...next.links.byId };
        for (const id of dropped) delete byId[id];
        next = {
            ...next,
            links: {
                byId,
                order: next.links.order.filter((id) => !dropped.has(id)),
            },
        };
    }
    return next;
}

const family = (id: DatabaseType): DatabaseType =>
    dialectFor(id).variantOf ?? id;

/**
 * What the target's own writer cannot say: it writes tables only, and MySQL
 * and MariaDB have no partial indexes. The converter reports the same views.
 */
function unkeptByWriter(
    design: Design,
    targetFamily: DatabaseType
): Diagnostic[] {
    const out: Diagnostic[] = [];
    const views = design.entities.order.filter(
        (id) => design.entities.byId[id].kind === 'view'
    ).length;
    if (views > 0)
        out.push({
            severity: 'warning',
            message: `${views} view${views === 1 ? '' : 's'} not exported: only tables are written`,
        });
    if (targetFamily !== 'mysql') return out;
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
 * through the converter.
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
    const filtered = applyFilter(design, options.filter, source.defaultSchema);
    if (
        !filtered.entities.order.some(
            (id) => filtered.entities.byId[id].kind === 'table'
        )
    )
        return {
            text: '',
            diagnostics: [
                { ...error('Nothing to export'), code: 'nothing-to-export' },
            ],
        };
    // text the writers put into the DDL as it is must not end its statement
    const unsafe = unsafeText(filtered);
    if (unsafe.length > 0) return { text: '', diagnostics: unsafe };
    if (family(design.databaseType) === family(targetId))
        return {
            text: target.sql.write(filtered),
            diagnostics: unkeptByWriter(filtered, family(targetId)),
        };
    return convertDesign(filtered, source, target);
}
