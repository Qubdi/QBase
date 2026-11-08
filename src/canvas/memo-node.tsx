import React, { memo, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { ColorPicker } from '@/components/color-picker/color-picker';
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
                'group/note relative flex h-full w-full flex-col overflow-hidden rounded-md border border-slate-500 dark:border-slate-600',
                selected && 'ring-2 ring-primary'
            )}
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
            <div className="h-2 shrink-0" style={{ background: memo.tint }} />
            {surface.editable && !editing ? (
                <div className="nodrag absolute right-1 top-3 z-10 flex items-center gap-0.5 rounded bg-white/90 p-1 opacity-0 shadow-md transition-opacity focus-within:opacity-100 group-hover/note:opacity-100 pointer-coarse:opacity-100 dark:bg-slate-800/90">
                    <button
                        type="button"
                        aria-label={t('canvas.memo.editNote')}
                        title={t('canvas.memo.editNote')}
                        className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        onClick={() => {
                            done.current = false;
                            setDraft(memo.body);
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ColorPicker
                        color={asHex(memo.tint)}
                        popoverOnMouseDown={(event) => event.stopPropagation()}
                        onChange={(next) =>
                            storeApi.getState().edit({
                                type: 'item.update',
                                collection: 'memos',
                                id,
                                patch: { tint: next },
                            })
                        }
                    />
                </div>
            ) : null}
            <div
                className="relative min-h-0 flex-1 p-2 text-sm leading-[22.75px] text-gray-700 dark:text-gray-300"
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
                    <p className="italic text-gray-500">
                        {t('canvas.memo.placeholder')}
                    </p>
                )}
                <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 right-0 h-[30px] w-[30px] bg-black/10 dark:bg-white/10"
                    style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                />
            </div>
        </div>
    );
});
