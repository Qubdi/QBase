import React, { memo, useMemo, useState } from 'react';
import { NodeResizeControl, ResizeControlVariant } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import {
    ArrowRight,
    ChevronDown,
    ChevronUp,
    Minus,
    MoveHorizontal,
    Pencil,
    Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TABLE_WIDTH } from '@/core/model/entity';
import type { Column } from '@/core/model/column';
import { cn } from '@/lib/utils/utils';
import { useEditorStoreApi } from '@/store/store-context';
import { FieldRow } from './field-row';
import { linkRoles, shownColumns, subtitleParts } from './field-view';
import { useShown } from './diff-marks';
import type { EntityNode } from './flow-model';
import { toggledWidth } from './geometry';
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
    const [localExpanded, setLocalExpanded] = useState(false);

    const roles = useMemo(() => linkRoles({ links }, id), [links, id]);
    if (!entity) return null;

    const expanded = surface.editable ? !!entity.expanded : localExpanded;
    const visibleColumns = shownColumns(columns, expanded, roles.linked);
    const hiddenCount = columns.length - visibleColumns.length;
    const canCollapse = columns.length > visibleColumns.length || expanded;
    const isView = entity.kind === 'view';
    const width = entity.width ?? TABLE_WIDTH.default;

    if (surface.editingId === id && hooks.renderEntityEditor) {
        return (
            <div className="nodrag nowheel nopan">
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

    return (
        <div
            data-testid={`entity-${id}`}
            data-selected={selected}
            className={cn(
                'group relative overflow-visible rounded-lg border bg-card text-card-foreground shadow-sm transition-opacity',
                selected && 'ring-2 ring-primary',
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

            <header
                className="flex items-center gap-2 rounded-t-lg border-b px-3 py-2"
                style={{
                    background: headerWash(entity.color),
                }}
            >
                <span
                    aria-hidden
                    data-testid={`swatch-${id}`}
                    data-hollow={isView}
                    className="h-3 w-3 shrink-0 rounded-full border-2"
                    style={{
                        borderColor: entity.color,
                        background: isView ? 'transparent' : entity.color,
                    }}
                />
                <div className="min-w-0 flex-1">
                    <div
                        className={cn(
                            'truncate text-sm font-bold',
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
                    </div>
                    {subtitle.length > 0 ? (
                        <div
                            className="truncate text-[11px] text-muted-foreground"
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
                <span
                    className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground group-hover:hidden"
                    title={t('canvas.entity.fieldCount', {
                        count: columns.length,
                    })}
                >
                    {columns.length}
                </span>
                <span className="nodrag hidden items-center gap-0.5 group-hover:flex">
                    {surface.editable ? (
                        <button
                            type="button"
                            aria-label={t('canvas.entity.openInPanel')}
                            title={t('canvas.entity.openInPanel')}
                            className="rounded p-1 hover:bg-muted"
                            onClick={() =>
                                storeApi.getState().showEntityInPanel(id)
                            }
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                    {surface.editable ? (
                        <button
                            type="button"
                            aria-label={
                                width >= TABLE_WIDTH.max
                                    ? t('canvas.entity.narrow')
                                    : t('canvas.entity.widen')
                            }
                            title={
                                width >= TABLE_WIDTH.max
                                    ? t('canvas.entity.narrow')
                                    : t('canvas.entity.widen')
                            }
                            className="rounded p-1 hover:bg-muted"
                            onClick={() =>
                                storeApi.getState().edit({
                                    type: 'entity.update',
                                    id,
                                    patch: {
                                        width: toggledWidth(entity.width),
                                    },
                                })
                            }
                        >
                            <MoveHorizontal className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                </span>
            </header>

            <div className="py-1">
                {visibleColumns.map((column) => (
                    <FieldRow
                        key={column.id}
                        entityId={id}
                        column={column}
                        databaseType={databaseType}
                        foreign={roles.foreign.has(column.id)}
                        connectable={surface.editable && !isView}
                        prefs={surface.prefs}
                    />
                ))}
            </div>

            {canCollapse ? (
                <button
                    type="button"
                    className="nodrag flex w-full items-center justify-center gap-1 rounded-b-lg border-t py-1 text-[11px] text-muted-foreground hover:bg-muted"
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
