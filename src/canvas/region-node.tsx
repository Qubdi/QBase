import React, { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import type { RegionNode } from './flow-model';
import { MIN_REGION_HEIGHT } from './geometry';
import { useSurface } from './surface-context';
import { regionFill, regionStrip } from './tints';

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
                'h-full w-full rounded-lg border-2',
                selected && 'ring-2 ring-primary ring-offset-1'
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
                    handleStyle={{ width: 10, height: 10 }}
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
                className="inline-block max-w-full rounded-br-md rounded-tl-md px-2 py-1 text-xs font-semibold"
                style={{
                    background: regionStrip(region.tint),
                }}
                onDoubleClick={(event) => {
                    if (!surface.editable) return;
                    event.stopPropagation();
                    done.current = false;
                    setDraft(region.label);
                }}
            >
                {renaming ? (
                    <input
                        ref={input}
                        aria-label={t('canvas.region.rename')}
                        className="nodrag w-40 rounded border bg-background px-1 text-xs font-normal"
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
                    <span className="truncate">{region.label}</span>
                )}
            </div>
        </div>
    );
});
