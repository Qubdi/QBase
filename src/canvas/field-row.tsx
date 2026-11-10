import React, { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import { KeyRound, Link2, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { Id } from '@/core/model/id';
import { cn } from '@/lib/utils/utils';
import { useEditorStoreApi } from '@/store/store-context';
import {
    KIND_CLASSES,
    LINKED_CHIP_CLASS,
    OVERLAP_CHIP_CLASS,
    chipText,
    linkNotes,
    typeKind,
} from './field-view';
import { handleId } from './flow-model';
import type { CanvasPrefs } from './hooks';

export const ROW_HEIGHT = 32;
/**
 * Below this zoom a row keeps its connection dots only when a line ends on it
 * (the dots are far too small to use, and thousands of them make a large
 * diagram slow to draw).
 */
export const HANDLES_MIN_ZOOM = 0.4;
/** The tint of a field that uses the highlighted custom type: one place to change. */
export const HIGHLIGHT_CLASS = 'bg-yellow-300/50 dark:bg-yellow-400/30';
/** the SQL word the old hover card shows as the label of the nullability row */
const NULL_WORD = 'null';
const TOUCH_MOUSE_MS = 1000;

/** The words a row needs, translated once per table instead of once per row. */
export interface FieldLabels {
    primaryKey: string;
    foreignKey: string;
    unique: string;
    nullable: string;
    required: string;
    edit: string;
}

interface FieldRowProps {
    labels: FieldLabels;
    entityId: Id;
    column: Column;
    databaseType: DatabaseType;
    foreign: boolean;
    /** the dots for drawing a relationship are offered */
    connectable: boolean;
    /** the row has its connection dots in the page (see `HANDLES_MIN_ZOOM`) */
    handles: boolean;
    prefs: CanvasPrefs;
    /** the name of the custom type being highlighted (EDT-196) */
    highlightType?: string;
    /** a selected line ends on this field: soft teal row, green chip */
    linkEnd?: boolean;
    /** the table overlaps another one and the overlap highlight is on */
    overlap?: boolean;
    /** names of the enum types, which a chip shows as `text` */
    enumNames?: ReadonlySet<string>;
    /** the pencil on a hovered row opens the edit card */
    onEdit?(): void;
}

// The 12 px dot is hidden until the pointer is over the table (or a line is
// being drawn: the canvas sets `data-linking`); it also shows while the table
// has the focus or is selected and on touch screens. The ::after layer widens
// the target well past the dot.
const dotClass = [
    '!h-3 !w-3 !border !border-solid !border-teal-600 !bg-white opacity-0 transition-opacity',
    'group-hover:opacity-100 group-focus-within:opacity-100',
    'group-data-[selected=true]:opacity-100 pointer-coarse:opacity-100',
    'pointer-coarse:!h-3.5 pointer-coarse:!w-3.5',
    "after:absolute after:-inset-2 after:content-['']",
].join(' ');

/** One field of a table: icon, name, badges, type chip, nullability dot. */
export const FieldRow = memo(function FieldRow({
    labels,
    entityId,
    column,
    databaseType,
    foreign,
    connectable,
    handles,
    prefs,
    highlightType,
    linkEnd,
    overlap,
    enumNames,
    onEdit,
}: FieldRowProps) {
    const storeApi = useEditorStoreApi();
    const { t } = useTranslation();
    // the hovered row element while the card is open; the card is placed beside it
    const [card, setCard] = useState<HTMLElement | null>(null);

    // a finger makes the browser send an emulated mouseenter that would keep the
    // card open until the next tap: those are ignored
    const touchedAt = useRef(0);
    const hoverStart = (event: React.MouseEvent<HTMLElement>) => {
        if (Date.now() - touchedAt.current < TOUCH_MOUSE_MS) return;
        setCard(event.currentTarget);
    };
    const hoverEnd = () => setCard(null);

    const kind = typeKind(column.type.name);
    const highlighted =
        highlightType !== undefined &&
        (column.type.id === highlightType ||
            column.type.name === highlightType);

    const chipClass = linkEnd
        ? LINKED_CHIP_CLASS
        : overlap
          ? OVERLAP_CHIP_CLASS
          : KIND_CLASSES[kind];

    return (
        <div
            data-testid={`field-${column.id}`}
            data-highlighted={highlighted || undefined}
            data-link-end={linkEnd || undefined}
            className={cn(
                // a click on the row follows its field, so it is the pointing finger, not the table's grab hand
                'group/row relative flex h-8 cursor-pointer items-center gap-1 border-t px-3 text-sm transition-all duration-200 ease-in-out',
                linkEnd
                    ? 'bg-teal-100 dark:bg-teal-900/60'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                highlighted && HIGHLIGHT_CLASS
            )}
            style={{ height: ROW_HEIGHT }}
            onTouchStart={() => {
                touchedAt.current = Date.now();
            }}
            onMouseEnter={hoverStart}
            onMouseLeave={hoverEnd}
        >
            {(handles ? (['l', 'r'] as const) : []).map((side) => (
                <Handle
                    key={side}
                    id={handleId(column.id, side)}
                    type="source"
                    position={side === 'l' ? Position.Left : Position.Right}
                    isConnectable={connectable}
                    className={connectable ? dotClass : '!opacity-0'}
                />
            ))}
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {column.primaryKey ? (
                    <KeyRound
                        aria-label={labels.primaryKey}
                        className="h-3.5 w-3.5 text-amber-500"
                    />
                ) : foreign ? (
                    <Link2
                        aria-label={labels.foreignKey}
                        className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400"
                    />
                ) : null}
            </span>
            <div
                className={cn(
                    'flex min-w-0 flex-1 items-center gap-1',
                    column.primaryKey || column.unique
                        ? 'font-semibold'
                        : 'font-normal',
                    foreign && !column.primaryKey
                        ? 'text-blue-600 dark:text-blue-400'
                        : undefined
                )}
            >
                <span
                    className="min-w-0 truncate"
                    title={column.comments || undefined}
                >
                    {column.name}
                </span>
            </div>
            <span
                className={cn(
                    'flex shrink-0 items-center gap-1',
                    onEdit &&
                        'group-hover/row:hidden group-focus-within/row:hidden'
                )}
            >
                {column.unique && !column.primaryKey ? (
                    <span className="shrink-0 rounded-xs border px-1 text-[9px] font-semibold leading-3 text-muted-foreground">
                        {labels.unique}
                    </span>
                ) : null}
                {prefs.compact ? null : (
                    <>
                        <span
                            data-kind={kind}
                            className={cn(
                                'min-w-0 overflow-hidden rounded-[10px] px-1.5 py-0.5 text-right font-mono text-[11px] font-semibold leading-[15.7143px]',
                                chipClass
                            )}
                        >
                            <span className="block truncate">
                                {chipText(
                                    column,
                                    databaseType,
                                    prefs.showFieldAttributes,
                                    enumNames
                                )}
                            </span>
                        </span>
                        <span
                            role="img"
                            title={
                                column.nullable
                                    ? t('canvas.fieldCard.nullable')
                                    : t('canvas.fieldCard.notNull')
                            }
                            aria-label={
                                column.nullable
                                    ? labels.nullable
                                    : labels.required
                            }
                            data-nullable={column.nullable}
                            className={cn(
                                'box-border h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/60',
                                !column.nullable && 'bg-muted-foreground/60'
                            )}
                        />
                    </>
                )}
            </span>
            {onEdit ? (
                <button
                    type="button"
                    aria-label={labels.edit}
                    title={labels.edit}
                    className="nodrag absolute right-3 flex h-6 w-6 items-center justify-center rounded text-teal-600 opacity-0 hover:bg-slate-200 focus-visible:opacity-100 group-hover/row:static group-hover/row:opacity-100 group-focus-within/row:static group-focus-within/row:opacity-100 pointer-coarse:static pointer-coarse:h-8 pointer-coarse:w-8 pointer-coarse:opacity-100 dark:hover:bg-slate-700"
                    onClick={(event) => {
                        event.stopPropagation();
                        onEdit();
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            ) : null}
            {card ? (
                <FieldCard
                    anchor={card}
                    column={column}
                    entityId={entityId}
                    databaseType={databaseType}
                    storeApi={storeApi}
                    enumNames={enumNames}
                />
            ) : null}
        </div>
    );
});

function FieldCard({
    anchor,
    column,
    entityId,
    databaseType,
    storeApi,
    enumNames,
}: {
    anchor: HTMLElement | null;
    column: Column;
    entityId: Id;
    databaseType: DatabaseType;
    storeApi: ReturnType<typeof useEditorStoreApi>;
    enumNames?: ReadonlySet<string>;
}) {
    const { t } = useTranslation();
    const notes = linkNotes(storeApi.getState().design, entityId, column.id);
    const [place, setPlace] = useState<{ left: number; top: number }>();
    const card = useRef<HTMLDivElement>(null);
    // drawn at the body level, right of the row and centred on it; a card that
    // would leave the window goes to the left of the row instead
    useEffect(() => {
        if (!anchor || !card.current) return;
        const row = anchor.getBoundingClientRect();
        const box = card.current.getBoundingClientRect();
        let left = row.right + 12;
        if (left + box.width > window.innerWidth - 8)
            left = Math.max(8, row.left - 12 - box.width);
        const top = Math.min(
            Math.max(8, row.top + row.height / 2 - box.height / 2),
            Math.max(8, window.innerHeight - 8 - box.height)
        );
        setPlace({ left, top });
    }, [anchor]);
    const label = (key: string) => t(key).toLowerCase();
    return createPortal(
        <div
            ref={card}
            role="tooltip"
            data-testid="field-card"
            className="pointer-events-none fixed z-50 w-[248px] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{
                left: place?.left ?? -9999,
                top: place?.top ?? -9999,
            }}
        >
            <div className="text-sm font-semibold">{column.name}</div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">
                    {label('canvas.fieldCard.type')}
                </dt>
                <dd className="font-mono">
                    {chipText(column, databaseType, true, enumNames)}
                </dd>
                <dt className="text-muted-foreground">{NULL_WORD}</dt>
                <dd className="font-mono uppercase">
                    {column.nullable
                        ? t('canvas.fieldCard.nullable')
                        : t('canvas.fieldCard.notNull')}
                </dd>
                {column.primaryKey || column.unique ? (
                    <>
                        <dt className="text-muted-foreground">
                            {label('canvas.fieldCard.key')}
                        </dt>
                        <dd className="font-mono">
                            {[
                                column.primaryKey
                                    ? t('canvas.fieldCard.primaryKey')
                                    : '',
                                column.unique
                                    ? t('canvas.fieldCard.unique')
                                    : '',
                            ]
                                .filter(Boolean)
                                .join(', ')}
                        </dd>
                    </>
                ) : null}
                {column.default ? (
                    <>
                        <dt className="text-muted-foreground">
                            {label('canvas.fieldCard.default')}
                        </dt>
                        <dd className="break-all font-mono">
                            {column.default}
                        </dd>
                    </>
                ) : null}
                {notes.map((note, i) => (
                    <dd
                        key={i}
                        className="col-span-2 break-all font-mono text-muted-foreground"
                    >
                        {t(
                            note.direction === 'references'
                                ? 'canvas.fieldCard.references'
                                : 'canvas.fieldCard.referencedBy',
                            {
                                table: note.entityName,
                                field: note.columnName,
                            }
                        )}
                    </dd>
                ))}
            </dl>
            {column.comments ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                    {column.comments}
                </p>
            ) : null}
        </div>,
        document.body
    );
}
