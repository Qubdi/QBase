import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    Handle,
    NodeResizeControl,
    Position,
    ResizeControlVariant,
    useUpdateNodeInternals,
} from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import {
    ArrowRight,
    ChevronDown,
    ChevronUp,
    ChevronsLeftRight,
    CircleDotDashed,
    Minus,
    Pencil,
    Plus,
    Table2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TABLE_WIDTH } from '@/core/model/entity';
import type { Column } from '@/core/model/column';
import { cn } from '@/lib/utils/utils';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { FieldRow, HANDLES_MIN_ZOOM } from './field-row';
import { linkRoles, shownColumns, subtitleParts } from './field-view';
import { useShown } from './diff-marks';
import { dependencyHandleId } from './flow-model';
import type { EntityNode } from './flow-model';
import { useCanvasHooks } from './hooks';
import { useSurface } from './surface-context';
import { headerWash } from './tints';

const MARK_TEXT = {
    added: 'text-green-600',
    removed: 'text-red-600',
    changed: 'text-blue-600',
} as const;
const MARK_BADGE = {
    added: 'bg-green-600',
    removed: 'bg-red-600',
    changed: 'bg-blue-600',
} as const;

/**
 * The header buttons are always in the page so the keyboard reaches them; they
 * take the place of the field count on hover, focus, selection and on touch
 * screens.
 */
const ACTIONS_CLASS = [
    'nodrag absolute right-3 flex items-center gap-0.5 opacity-0',
    'group-hover:static group-hover:opacity-100',
    'group-focus-within:static group-focus-within:opacity-100',
    'pointer-coarse:static pointer-coarse:opacity-100',
].join(' ');

const ICON_BUTTON =
    'flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-700/70 pointer-coarse:h-8 pointer-coarse:w-8';

// shown on hover, focus, selection and on touch screens, like a field's dots
const DEPENDENCY_DOT = [
    '!h-3 !w-3 !border !border-solid !border-teal-600 !bg-white opacity-0 transition-opacity',
    'group-hover:opacity-100 group-focus-within:opacity-100',
    'group-data-[selected=true]:opacity-100 pointer-coarse:opacity-100',
    'pointer-coarse:!h-3.5 pointer-coarse:!w-3.5',
    "after:absolute after:-inset-2 after:content-['']",
].join(' ');

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((item, i) => item === b[i]);

/** A table or view on the canvas: a pure view of one entity record. */
export const EntityCard = memo(function EntityCard({
    id,
    data,
    selected,
}: NodeProps<EntityNode>) {
    const { t } = useTranslation();
    const surface = useSurface();
    const hooks = useCanvasHooks();
    const storeApi = useEditorStoreApi();
    const entity = useShown((d) => d.entities.byId[id]);
    const columns = useShown((d) => {
        const e = d.entities.byId[id];
        return e ? e.columnIds.map((c) => d.columns[c]) : [];
    }, sameList) as Column[];
    const links = useShown((d) => d.links);
    const databaseType = useShown((d) => d.databaseType);
    const enumKey = useShown((d) =>
        d.userTypes.order
            .map((tid) => d.userTypes.byId[tid])
            .filter((u) => u?.kind === 'enum')
            .map((u) => u.name)
            .join('\u0000')
    );
    const enumNames = useMemo(
        () => new Set(enumKey ? enumKey.split('\u0000') : []),
        [enumKey]
    );
    // the columns a selected line ends on get the soft teal row (EDT-174)
    const endsKey = useEditorStore((s) => {
        const ends: string[] = [];
        for (const sel of s.ui.selection) {
            const link = s.design.links.byId[sel];
            if (!link) continue;
            if (link.sourceEntityId === id) ends.push(link.sourceColumnId);
            if (link.targetEntityId === id) ends.push(link.targetColumnId);
        }
        return ends.join('|');
    });
    const linkEnds = useMemo(
        () => new Set(endsKey ? endsKey.split('|') : []),
        [endsKey]
    );
    const highlightType = useEditorStore((s) =>
        s.ui.highlightedTypeId
            ? s.design.userTypes.byId[s.ui.highlightedTypeId]?.name
            : undefined
    );
    const [localExpanded, setLocalExpanded] = useState(false);
    // the pencil of each row is only drawn for a table the pointer is over, or that
    // is selected or has the focus: 1600 hidden buttons made every drag frame slow
    const [pointerOver, setPointerOver] = useState(false);
    const detailed = useEditorStore((s) => s.ui.zoom >= HANDLES_MIN_ZOOM);

    const labels = useMemo(
        () => ({
            primaryKey: t('canvas.entity.primaryKey'),
            foreignKey: t('canvas.entity.foreignKey'),
            unique: t('canvas.entity.unique'),
            nullable: t('canvas.entity.nullable'),
            required: t('canvas.entity.required'),
            edit: t('canvas.entity.edit'),
        }),
        [t]
    );
    const roles = useMemo(() => linkRoles({ links }, id), [links, id]);
    // xyflow measures a node's field handles when its size changes; when the
    // fields get new ids at the same size (accepting a DBML change, undoing it)
    // the old handles would stay and the lines would vanish
    const updateInternals = useUpdateNodeInternals();
    const columnKey = columns.map((c) => c?.id).join('|');
    // not on the first draw: xyflow measures a new node itself
    const seenKey = useRef(columnKey);
    useEffect(() => {
        if (seenKey.current === columnKey) return;
        seenKey.current = columnKey;
        updateInternals(id);
    }, [updateInternals, id, columnKey]);
    if (!entity) return null;

    const expanded = surface.editable ? !!entity.expanded : localExpanded;
    const visibleColumns = shownColumns(columns, expanded, roles.linked);
    const hiddenCount = columns.length - visibleColumns.length;
    const canCollapse = columns.length > visibleColumns.length || expanded;
    const isView = entity.kind === 'view';
    const width = entity.width ?? TABLE_WIDTH.default;

    if (surface.editingId === id && hooks.renderEntityEditor) {
        return (
            <div
                data-edit-card
                className="nodrag nowheel nopan w-max overflow-y-auto"
                style={{ maxHeight: surface.editMaxHeight }}
            >
                {hooks.renderEntityEditor({
                    entityId: id,
                    close: surface.stopEditing,
                })}
            </div>
        );
    }

    const subtitle = subtitleParts(entity, {
        view: t('canvas.entity.view'),
        materializedView: t('canvas.entity.materializedView'),
    });

    const toggleExpanded = () => {
        if (surface.editable)
            storeApi.getState().editWithoutHistory({
                type: 'entity.update',
                id,
                patch: { expanded: !expanded },
            });
        else setLocalExpanded(!expanded);
    };

    const expandLabel = expanded
        ? t('canvas.entity.showLess')
        : t('canvas.entity.showMore');

    return (
        <div
            data-testid={`entity-${id}`}
            data-selected={selected}
            className={cn(
                'group relative overflow-visible rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] transition-[opacity,filter] duration-200',
                (selected || surface.linkSourceId === id) &&
                    'border-primary ring-2 ring-primary/25',
                'hover:border-primary hover:ring-2 hover:ring-primary/25',
                data.dimmed && 'opacity-40 grayscale',
                data.mark === 'added' && 'ring-2 ring-green-500',
                data.mark === 'removed' && 'ring-2 ring-red-500',
                data.mark === 'changed' && 'ring-2 ring-blue-500',
                data.flashing && 'ring-2 ring-red-500',
                data.outlined &&
                    !data.flashing &&
                    'outline outline-1 outline-red-400/50'
            )}
            style={{ width }}
            onPointerEnter={() => setPointerOver(true)}
            onPointerLeave={() => setPointerOver(false)}
            onDoubleClick={(event) => {
                if (!surface.editable) return;
                event.stopPropagation();
                surface.startEditing(id);
            }}
        >
            {selected && surface.editable
                ? (['left', 'right'] as const).map((edge) => (
                      <NodeResizeControl
                          key={edge}
                          position={edge}
                          variant={ResizeControlVariant.Line}
                          resizeDirection="horizontal"
                          minWidth={TABLE_WIDTH.min}
                          maxWidth={TABLE_WIDTH.max}
                          style={{
                              borderColor: 'transparent',
                              width: 8,
                              cursor: 'ew-resize',
                          }}
                          onResize={(_, box) =>
                              surface.resizeLive(id, {
                                  x: box.x,
                                  y: box.y,
                                  width: box.width,
                                  height: box.height,
                              })
                          }
                          onResizeEnd={() => surface.resizeEnd()}
                      />
                  ))
                : null}

            {/* top and bottom dots: a view offers them for a dependency (EDT-183);
                a table keeps them out of sight so a dependency line can end on it */}
            {(['t', 'b'] as const).map((side) => (
                <Handle
                    key={side}
                    id={dependencyHandleId(side)}
                    type="source"
                    position={side === 't' ? Position.Top : Position.Bottom}
                    isConnectable={surface.editable && isView}
                    className={
                        surface.editable && isView
                            ? DEPENDENCY_DOT
                            : '!pointer-events-none !opacity-0'
                    }
                />
            ))}

            <header
                className="relative flex h-12 items-center gap-2.5 rounded-t-[11px] border-b px-3"
                style={{
                    background: headerWash(entity.color),
                }}
            >
                <span
                    aria-hidden
                    data-testid={`swatch-${id}`}
                    data-hollow={isView}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{
                        background: entity.color,
                    }}
                >
                    <Table2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <label
                        className={cn(
                            'block cursor-default truncate text-[13.5px] font-semibold leading-tight',
                            data.mark && MARK_TEXT[data.mark]
                        )}
                        data-diff-name={data.mark}
                    >
                        {data.renamedFrom !== undefined ? (
                            <>
                                <s
                                    data-testid={`renamed-from-${id}`}
                                    className="font-normal text-red-600 opacity-80"
                                >
                                    {data.renamedFrom}
                                </s>
                                <ArrowRight
                                    aria-hidden
                                    className="mx-1 inline h-3 w-3"
                                />
                            </>
                        ) : null}
                        {entity.name}
                    </label>
                    {subtitle.length > 0 ? (
                        <div
                            className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground"
                            title={entity.comments || undefined}
                        >
                            {subtitle.join(' · ')}
                        </div>
                    ) : null}
                </div>
                {data.mark ? (
                    <span
                        data-testid={`diff-badge-${id}`}
                        data-diff={data.mark}
                        title={t(`canvas.diff.${data.mark}`)}
                        className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white',
                            MARK_BADGE[data.mark]
                        )}
                    >
                        {data.mark === 'added' ? (
                            <Plus className="h-3 w-3" />
                        ) : data.mark === 'removed' ? (
                            <Minus className="h-3 w-3" />
                        ) : (
                            <Pencil className="h-3 w-3" />
                        )}
                    </span>
                ) : null}
                {data.overlapCount ? (
                    <span
                        data-testid={`overlap-pill-${id}`}
                        className="shrink-0 rounded-full bg-red-100 px-1.5 text-[10px] font-semibold leading-4 text-red-800"
                    >
                        {data.overlapCount}
                    </span>
                ) : null}
                <span
                    className="tabular-nums shrink-0 rounded-full bg-background/70 px-1.5 text-[11px] font-semibold leading-4 text-muted-foreground group-hover:hidden group-focus-within:hidden pointer-coarse:hidden"
                    title={t('canvas.entity.fieldCount', {
                        count: columns.length,
                    })}
                >
                    {columns.length}
                </span>
                <span className={ACTIONS_CLASS}>
                    <button
                        type="button"
                        aria-label={t('canvas.entity.focus')}
                        title={t('canvas.entity.focus')}
                        className={ICON_BUTTON}
                        onClick={() => {
                            storeApi.getState().select([id]);
                            storeApi.getState().focusEntity(id);
                        }}
                    >
                        <CircleDotDashed className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label={expandLabel}
                        title={expandLabel}
                        className={ICON_BUTTON}
                        onClick={toggleExpanded}
                    >
                        <ChevronsLeftRight className="h-4 w-4" />
                    </button>
                </span>
            </header>

            <div
                className={cn(
                    !canCollapse && '[&>:last-child]:rounded-b-[11px]'
                )}
            >
                {visibleColumns.map((column) => (
                    <FieldRow
                        key={column.id}
                        labels={labels}
                        handles={detailed || roles.linked.has(column.id)}
                        entityId={id}
                        column={column}
                        databaseType={databaseType}
                        foreign={roles.foreign.has(column.id)}
                        connectable={surface.editable && !isView}
                        prefs={surface.prefs}
                        highlightType={highlightType}
                        linkEnd={linkEnds.has(column.id)}
                        overlap={!!data.overlapCount}
                        enumNames={enumNames}
                        onEdit={
                            surface.editable && (pointerOver || selected)
                                ? () => surface.startEditing(id)
                                : undefined
                        }
                    />
                ))}
            </div>

            {canCollapse ? (
                <button
                    type="button"
                    className="nodrag flex h-8 w-full items-center justify-center gap-1 rounded-b-[11px] border-t text-[10px] text-muted-foreground transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={toggleExpanded}
                    data-hidden-count={hiddenCount}
                >
                    {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                    ) : (
                        <ChevronDown className="h-3 w-3" />
                    )}
                    {expanded
                        ? t('canvas.entity.showLess')
                        : t('canvas.entity.showMore')}
                </button>
            ) : null}
        </div>
    );
});
