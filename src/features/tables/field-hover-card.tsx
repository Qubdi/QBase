import React from 'react';
import { createPortal } from 'react-dom';
import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { linksOfColumn } from '@/core/model/lookup';
import { typeLabel } from '@/core/model/type-suffix';
import { useText } from '@/platform/panel/use-text';

const CARD_WIDTH = 248;
const GAP = 12;

export interface FieldHoverCardProps {
    /** the row the mouse rests on, in screen coordinates */
    anchor: DOMRect;
    design: Design;
    entityId: Id;
    column: Column;
}

/**
 * Details of a column, shown beside the table while the mouse rests on its
 * row (EDT-116): type with size, nullability, key flags, default, check and
 * the columns it references or is referenced by. It is drawn on the page, not
 * inside the table, so the table's clipping and the canvas zoom do not cut or
 * shrink it.
 */
export const FieldHoverCard: React.FC<FieldHoverCardProps> = ({
    anchor,
    design,
    entityId,
    column,
}) => {
    const text = useText();
    const fitsRight = anchor.right + GAP + CARD_WIDTH <= window.innerWidth;
    const left = fitsRight
        ? anchor.right + GAP
        : Math.max(GAP, anchor.left - GAP - CARD_WIDTH);
    const top = anchor.top + anchor.height / 2;

    const flags = [
        column.primaryKey ? text('hover.primaryKey') : null,
        column.unique && !column.primaryKey ? text('hover.unique') : null,
        column.increment ? text('hover.autoIncrement') : null,
    ].filter((f): f is string => f !== null);

    const rows: [string, string][] = [
        [text('hover.type'), typeLabel(column, design.databaseType)],
        [
            text('hover.nullability'),
            column.nullable ? text('hover.nullable') : text('hover.notNull'),
        ],
    ];
    if (flags.length > 0) rows.push([text('hover.key'), flags.join(', ')]);
    if (column.default) rows.push([text('hover.default'), column.default]);
    if (column.check) rows.push([text('hover.check'), column.check]);

    // the target of a link holds the foreign key, the source is the referenced side
    for (const link of linksOfColumn(design, entityId, column.id)) {
        const holdsKey =
            link.targetEntityId === entityId &&
            link.targetColumnId === column.id;
        const otherEntity =
            design.entities.byId[
                holdsKey ? link.sourceEntityId : link.targetEntityId
            ];
        const other =
            design.columns[
                holdsKey ? link.sourceColumnId : link.targetColumnId
            ];
        if (!otherEntity || !other) continue;
        rows.push([
            holdsKey ? text('hover.references') : text('hover.referencedBy'),
            `${otherEntity.name}.${other.name}`,
        ]);
    }

    return createPortal(
        <div
            role="tooltip"
            style={{ left, top, width: CARD_WIDTH }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
            <div className="mb-2 truncate text-[13px] font-semibold">
                {column.name}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11.5px]">
                {rows.map(([label, value], i) => (
                    <React.Fragment key={`${i}:${label}:${value}`}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono text-[11px] [overflow-wrap:anywhere]">
                            {value}
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
            {column.comments ? (
                <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere] border-t pt-2 text-[11.5px] text-muted-foreground">
                    {column.comments}
                </p>
            ) : null}
        </div>,
        document.body
    );
};
