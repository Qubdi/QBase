import React from 'react';
import { createPortal } from 'react-dom';
import { generateDBFieldSuffix, type DBField } from '@/lib/domain/db-field';
import type { DatabaseType } from '@/lib/domain/database-type';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBTable } from '@/lib/domain/db-table';

const CARD_WIDTH = 248;
const GAP = 12;

export interface FieldHoverCardProps {
    anchor: DOMRect;
    field: DBField;
    tableId: string;
    relationships: DBRelationship[];
    getTable: (id: string) => DBTable | null;
    getField: (tableId: string, fieldId: string) => DBField | null;
    databaseType: DatabaseType;
}

interface Link {
    label: string;
    text: string;
}

// The same rule the row uses to mark a foreign key: it lives on the "many"
// side, or on the target when both sides match.
const holdsForeignKey = (rel: DBRelationship, onSource: boolean) => {
    const fkOnSource =
        rel.sourceCardinality === 'many' && rel.targetCardinality === 'one';
    return onSource ? fkOnSource : !fkOnSource;
};

const linksOf = ({
    field,
    tableId,
    relationships,
    getTable,
    getField,
}: FieldHoverCardProps): Link[] => {
    const links: Link[] = [];
    for (const rel of relationships) {
        const onSource =
            rel.sourceTableId === tableId && rel.sourceFieldId === field.id;
        const onTarget =
            rel.targetTableId === tableId && rel.targetFieldId === field.id;
        if (!onSource && !onTarget) continue;
        const otherTableId = onSource ? rel.targetTableId : rel.sourceTableId;
        const otherFieldId = onSource ? rel.targetFieldId : rel.sourceFieldId;
        const table = getTable(otherTableId);
        const other = getField(otherTableId, otherFieldId);
        if (!table || !other) continue;
        links.push({
            label: holdsForeignKey(rel, onSource)
                ? 'references'
                : 'referenced by',
            text: `${table.name}.${other.name}`,
        });
    }
    return links;
};

/**
 * Details of a column, shown beside the table while the mouse rests on its
 * row. It is drawn on the page, not inside the table, so the table's clipping
 * and the canvas zoom do not cut or shrink it.
 */
export const FieldHoverCard: React.FC<FieldHoverCardProps> = (props) => {
    const { anchor, field, databaseType } = props;
    const fitsRight = anchor.right + GAP + CARD_WIDTH <= window.innerWidth;
    const left = fitsRight
        ? anchor.right + GAP
        : Math.max(GAP, anchor.left - GAP - CARD_WIDTH);
    const top = anchor.top + anchor.height / 2;

    const type = `${field.type.name}${generateDBFieldSuffix(field, {
        databaseType,
    })}`;
    const links = linksOf(props);
    const flags = [
        field.primaryKey ? 'primary key' : null,
        field.unique && !field.primaryKey ? 'unique' : null,
        field.increment ? 'auto increment' : null,
    ].filter((f): f is string => f !== null);

    const rows: [string, string][] = [
        ['type', type],
        ['null', field.nullable ? 'nullable' : 'NOT NULL'],
    ];
    if (flags.length > 0) rows.push(['key', flags.join(', ')]);
    if (field.default) rows.push(['default', field.default]);
    if (field.check) rows.push(['check', field.check]);
    for (const link of links) rows.push([link.label, link.text]);

    return createPortal(
        <div
            role="tooltip"
            style={{ left, top, width: CARD_WIDTH }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
            <div className="mb-2 truncate text-[13px] font-semibold">
                {field.name}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
                {rows.map(([label, value]) => (
                    <React.Fragment key={`${label}:${value}`}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="break-words font-mono text-[11px]">
                            {value}
                        </dd>
                    </React.Fragment>
                ))}
            </dl>
            {field.comments ? (
                <p className="mt-2 whitespace-pre-wrap break-words border-t pt-2 text-[11.5px] text-muted-foreground">
                    {field.comments}
                </p>
            ) : null}
        </div>,
        document.body
    );
};
