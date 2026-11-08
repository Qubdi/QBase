import React, { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { KeyRound, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { Id } from '@/core/model/id';
import { cn } from '@/lib/utils/utils';
import { useEditorStoreApi } from '@/store/store-context';
import { KIND_CLASSES, chipText, linkNotes, typeKind } from './field-view';
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
const HOVER_DELAY_MS = 450;
const TOUCH_MOUSE_MS = 1000;

/** The words a row needs, translated once per table instead of once per row. */
export interface FieldLabels {
    primaryKey: string;
    foreignKey: string;
    unique: string;
    nullable: string;
    required: string;
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
}

// shown on hover, on focus inside the table, while the table is selected and on
// touch screens; the ::after layer widens the target well past the 10 px dot
const dotClass = [
    '!h-2.5 !w-2.5 !border-primary !bg-background opacity-0 transition-opacity',
    'group-hover/row:opacity-100 group-focus-within:opacity-100',
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
}: FieldRowProps) {
    const storeApi = useEditorStoreApi();
    const [card, setCard] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    // a finger makes the browser send an emulated mouseenter that would keep the
    // card open until the next tap: those are ignored
    const touchedAt = useRef(0);
    const hoverStart = () => {
        if (Date.now() - touchedAt.current < TOUCH_MOUSE_MS) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCard(true), HOVER_DELAY_MS);
    };
    const hoverEnd = () => {
        clearTimeout(timer.current);
        setCard(false);
    };

    const strong = column.primaryKey || column.unique;
    const kind = typeKind(column.type.name);
    const highlighted =
        highlightType !== undefined &&
        (column.type.id === highlightType ||
            column.type.name === highlightType);

    return (
        <div
            data-testid={`field-${column.id}`}
            data-highlighted={highlighted || undefined}
            className={cn(
                'group/row relative flex items-center gap-1.5 px-3 text-xs',
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
            {column.primaryKey ? (
                <KeyRound
                    aria-label={labels.primaryKey}
                    className="h-3.5 w-3.5 shrink-0 text-amber-500"
                />
            ) : foreign ? (
                <Link2
                    aria-label={labels.foreignKey}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
            ) : null}
            <span
                className={cn(
                    'min-w-0 flex-1 truncate',
                    strong && 'font-semibold'
                )}
                title={column.comments || undefined}
            >
                {column.name}
            </span>
            {column.unique && !column.primaryKey ? (
                <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                    {labels.unique}
                </span>
            ) : null}
            {prefs.compact ? null : (
                <>
                    <span
                        data-kind={kind}
                        className={cn(
                            'max-w-[45%] truncate rounded px-1.5 py-0.5 font-mono text-[11px]',
                            KIND_CLASSES[kind]
                        )}
                    >
                        {chipText(
                            column,
                            databaseType,
                            prefs.showFieldAttributes
                        )}
                    </span>
                    <span
                        role="img"
                        aria-label={
                            column.nullable ? labels.nullable : labels.required
                        }
                        data-nullable={column.nullable}
                        className={cn(
                            'h-2 w-2 shrink-0 rounded-full border border-muted-foreground',
                            !column.nullable && 'bg-muted-foreground'
                        )}
                    />
                </>
            )}
            {card ? (
                <FieldCard
                    column={column}
                    entityId={entityId}
                    databaseType={databaseType}
                    storeApi={storeApi}
                />
            ) : null}
        </div>
    );
});

function FieldCard({
    column,
    entityId,
    databaseType,
    storeApi,
}: {
    column: Column;
    entityId: Id;
    databaseType: DatabaseType;
    storeApi: ReturnType<typeof useEditorStoreApi>;
}) {
    const { t } = useTranslation();
    const notes = linkNotes(storeApi.getState().design, entityId, column.id);
    return (
        <div
            role="tooltip"
            className="nodrag pointer-events-none absolute left-full top-0 z-50 ml-3 w-56 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
        >
            <div className="font-semibold">{column.name}</div>
            <dl className="mt-1 space-y-0.5 text-muted-foreground">
                <div>
                    {t('canvas.fieldCard.type')}:{' '}
                    {chipText(column, databaseType, true)}
                </div>
                <div>
                    {column.nullable
                        ? t('canvas.fieldCard.nullable')
                        : t('canvas.fieldCard.notNull')}
                    {column.unique ? `, ${t('canvas.fieldCard.unique')}` : ''}
                    {column.primaryKey
                        ? `, ${t('canvas.fieldCard.primaryKey')}`
                        : ''}
                </div>
                {column.default ? (
                    <div>
                        {t('canvas.fieldCard.default')}: {column.default}
                    </div>
                ) : null}
                {column.comments ? <div>{column.comments}</div> : null}
                {notes.map((note, i) => (
                    <div key={i}>
                        {t(
                            note.direction === 'references'
                                ? 'canvas.fieldCard.references'
                                : 'canvas.fieldCard.referencedBy',
                            { table: note.entityName, field: note.columnName }
                        )}
                    </div>
                ))}
            </dl>
        </div>
    );
}
