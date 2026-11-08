import React, { useEffect, useRef } from 'react';
import { ArrowLeftRight, CircleDotDashed, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    planDeleteLink,
    planSetCardinality,
    planSwitchLink,
} from '@/core/commands/plan-link';
import type { Id } from '@/core/model/id';
import { cn } from '@/lib/utils/utils';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { useCanvasHooks } from './hooks';
import { useClampedPlacement } from './use-clamped';
import type { Point } from './flow-model';

interface Props {
    linkId: Id;
    at: Point;
    onClose(): void;
}

const toggle =
    'flex h-7 w-11 items-center justify-center rounded-[10px] border bg-card text-xs font-medium hover:bg-accent';
const button =
    'flex h-7 w-7 items-center justify-center rounded-[10px] text-xs hover:bg-accent';

/** The small box under the pointer that edits one relationship (EDT-175 to EDT-177). */
export function LinkPopover({ linkId, at, onClose }: Props) {
    const { t } = useTranslation();
    const storeApi = useEditorStoreApi();
    const hooks = useCanvasHooks();
    const link = useEditorStore((s) => s.design.links.byId[linkId]);
    const ref = useRef<HTMLDivElement>(null);
    const place = useClampedPlacement(ref, at);

    useEffect(() => {
        const away = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) onClose();
        };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', key);
        };
    }, [onClose]);

    useEffect(() => {
        if (!link) onClose();
    }, [link, onClose]);
    if (!link) return null;

    const oneToOne =
        link.sourceCardinality === 'one' && link.targetCardinality === 'one';
    const oneToMany =
        link.sourceCardinality === 'one' && link.targetCardinality === 'many';

    return (
        <div
            ref={ref}
            role="dialog"
            aria-label={t('canvas.link.label', { name: link.name })}
            className="fixed z-50 flex flex-wrap items-center gap-1 rounded-[10px] border bg-popover p-2 text-popover-foreground shadow-md"
            style={{
                left: place.left,
                top: place.top,
                maxWidth: 'calc(100vw - 16px)',
            }}
        >
            <button
                type="button"
                aria-pressed={oneToOne}
                className={cn(
                    toggle,
                    oneToOne &&
                        'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary'
                )}
                onClick={() =>
                    storeApi
                        .getState()
                        .edit(planSetCardinality(link, 'one-to-one'))
                }
            >
                {t('canvas.link.popover.oneToOne')}
            </button>
            <button
                type="button"
                aria-pressed={oneToMany}
                className={cn(
                    toggle,
                    oneToMany &&
                        'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary'
                )}
                onClick={() =>
                    storeApi
                        .getState()
                        .edit(planSetCardinality(link, 'one-to-many'))
                }
            >
                {t('canvas.link.popover.oneToMany')}
            </button>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
            <button
                type="button"
                aria-label={t('canvas.link.popover.switch')}
                title={t('canvas.link.popover.switch')}
                className={button}
                onClick={() => storeApi.getState().edit(planSwitchLink(link))}
            >
                <ArrowLeftRight className="h-4 w-4" />
            </button>
            <button
                type="button"
                aria-label={t('canvas.link.popover.openInPanel')}
                title={t('canvas.link.popover.openInPanel')}
                className={button}
                onClick={() => {
                    storeApi.getState().showPanel('refs');
                    hooks.showLinkInPanel?.(linkId);
                    onClose();
                }}
            >
                <CircleDotDashed className="h-4 w-4" />
            </button>
            <button
                type="button"
                aria-label={t('canvas.link.popover.remove')}
                title={t('canvas.link.popover.remove')}
                className={cn(button, 'text-destructive')}
                onClick={() => {
                    storeApi.getState().edit(planDeleteLink(linkId));
                    storeApi.getState().select([]);
                    onClose();
                }}
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );
}
