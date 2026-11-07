import React, { memo, useEffect, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import type { MemoNode } from './flow-model';
import { useSurface } from './surface-context';
import { asHex, memoPale } from './tints';

/** A sticky note: a strong header with the colour picker, a pale body with the text. */
export const MemoCard = memo(function MemoCard({
    id,
    selected,
}: NodeProps<MemoNode>) {
    const { t } = useTranslation();
    const surface = useSurface();
    const storeApi = useEditorStoreApi();
    const memo = useEditorStore((s) => s.design.memos.byId[id]);
    const [draft, setDraft] = useState<string>();
    const area = useRef<HTMLTextAreaElement>(null);
    const done = useRef(false);

    const editing = draft !== undefined;
    useEffect(() => {
        if (editing) area.current?.focus();
    }, [editing]);

    if (!memo) return null;

    const finish = (save: boolean) => {
        if (done.current) return;
        done.current = true;
        if (save && draft !== undefined && draft !== memo.body)
            storeApi.getState().edit({
                type: 'item.update',
                collection: 'memos',
                id,
                patch: { body: draft },
            });
        setDraft(undefined);
    };

    return (
        <div
            data-testid={`memo-${id}`}
            data-selected={selected}
            className={cn(
                'flex h-full w-full flex-col overflow-hidden rounded-md border shadow-sm',
                selected && 'ring-2 ring-primary'
            )}
            style={{ borderColor: memo.tint }}
        >
            {selected && surface.editable ? (
                <NodeResizer
                    minWidth={120}
                    minHeight={80}
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
                className="flex h-6 shrink-0 items-center justify-end px-1"
                style={{ background: memo.tint }}
            >
                {surface.editable ? (
                    <input
                        type="color"
                        aria-label={t('canvas.memo.colour')}
                        className="nodrag h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                        value={asHex(memo.tint)}
                        onChange={(event) =>
                            storeApi.getState().edit({
                                type: 'item.update',
                                collection: 'memos',
                                id,
                                patch: { tint: event.target.value },
                            })
                        }
                    />
                ) : null}
            </div>
            <div
                className="min-h-0 flex-1 p-2 text-xs"
                style={{
                    background: memoPale(memo.tint),
                }}
                onDoubleClick={(event) => {
                    if (!surface.editable) return;
                    event.stopPropagation();
                    done.current = false;
                    setDraft(memo.body);
                }}
            >
                {editing ? (
                    <textarea
                        ref={area}
                        aria-label={t('canvas.memo.edit')}
                        className="nodrag nowheel nopan h-full w-full resize-none bg-transparent outline-none"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => finish(true)}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Escape') finish(false);
                        }}
                    />
                ) : memo.body ? (
                    <p className="whitespace-pre-wrap break-words">
                        {memo.body}
                    </p>
                ) : (
                    <p className="text-muted-foreground/60">
                        {t('canvas.memo.placeholder')}
                    </p>
                )}
            </div>
        </div>
    );
});
