import React, { memo, useEffect, useRef, useState } from 'react';
import { GripVertical, Pencil } from 'lucide-react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import type { RegionNode } from './flow-model';
import { MIN_REGION_HEIGHT } from './geometry';
import { useSurface } from './surface-context';
import { regionFill } from './tints';

const MIN_REGION_WIDTH = 120;

/** An area: a tinted rectangle behind the tables, with its name on a strip. */
export const RegionCard = memo(function RegionCard({
    id,
    selected,
}: NodeProps<RegionNode>) {
    const { t } = useTranslation();
    const surface = useSurface();
    const storeApi = useEditorStoreApi();
    const region = useEditorStore((s) => s.design.regions.byId[id]);
    const [draft, setDraft] = useState<string>();
    const input = useRef<HTMLInputElement>(null);
    const done = useRef(false);

    const renaming = draft !== undefined;
    // "Edit Area Name" in the menu asks for the same box a double click opens
    useEffect(() => {
        if (surface.renamingId === id && region && draft === undefined) {
            done.current = false;
            setDraft(region.label);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [surface.renamingId, id]);
    useEffect(() => {
        if (renaming) input.current?.select();
    }, [renaming]);

    if (!region) return null;

    const finish = (save: boolean) => {
        if (done.current) return;
        done.current = true;
        const next = draft?.trim();
        if (save && next && next !== region.label)
            storeApi.getState().edit({
                type: 'item.update',
                collection: 'regions',
                id,
                patch: { label: next },
            });
        setDraft(undefined);
        if (surface.renamingId === id) surface.stopRename();
    };

    return (
        <div
            data-testid={`region-${id}`}
            data-selected={selected}
            className={cn(
                'h-full w-full rounded-[10px] border-2 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)]',
                selected && '!border-teal-600'
            )}
            style={{
                borderColor: region.tint,
                background: regionFill(region.tint),
            }}
        >
            {selected && surface.editable ? (
                <NodeResizer
                    minWidth={MIN_REGION_WIDTH}
                    minHeight={MIN_REGION_HEIGHT}
                    lineStyle={{ borderColor: 'transparent' }}
                    handleStyle={{
                        width: 10,
                        height: 10,
                        borderRadius: 0,
                        background: 'oklch(0.6 0.118 184.704)',
                        border: '1px solid #fff',
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
            ) : null}
            <div
                className="group/area flex h-8 items-center gap-1 rounded-t-[10px] px-2"
                onDoubleClick={(event) => {
                    if (!surface.editable) return;
                    event.stopPropagation();
                    done.current = false;
                    setDraft(region.label);
                }}
            >
                <GripVertical
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 opacity-60"
                />
                {renaming ? (
                    <input
                        ref={input}
                        aria-label={t('canvas.region.rename')}
                        className="nodrag w-40 rounded border bg-background px-1 text-base font-semibold"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => finish(true)}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') finish(true);
                            if (event.key === 'Escape') finish(false);
                        }}
                    />
                ) : (
                    <span className="min-w-0 flex-1 cursor-pointer truncate px-1 py-0.5 text-base font-semibold text-slate-700 dark:text-slate-300">
                        {region.label}
                    </span>
                )}
                {surface.editable && !renaming ? (
                    <button
                        type="button"
                        aria-label={t('canvas.menu.editAreaName')}
                        title={t('canvas.menu.editAreaName')}
                        className="nodrag flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover/area:opacity-100 pointer-coarse:h-6 pointer-coarse:w-6 pointer-coarse:opacity-100"
                        onClick={() => {
                            done.current = false;
                            setDraft(region.label);
                        }}
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                ) : null}
            </div>
        </div>
    );
});
