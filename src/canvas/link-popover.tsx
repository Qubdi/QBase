import React, { useEffect, useRef } from 'react';
import { ArrowLeftRight, PanelRight, Trash2 } from 'lucide-react';
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
import type { Point } from './flow-model';

interface Props {
    linkId: Id;
    at: Point;
    onClose(): void;
}

const button =
    'flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-muted';

/** The small box under the pointer that edits one relationship (EDT-175 to EDT-177). */
export function LinkPopover({ linkId, at, onClose }: Props) {
    const { t } = useTranslation();
    const storeApi = useEditorStoreApi();
    const hooks = useCanvasHooks();
    const link = useEditorStore((s) => s.design.links.byId[linkId]);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const away = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
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
            className="fixed z-50 flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: at.x, top: at.y }}
        >
            <button
                type="button"
                aria-pressed={oneToOne}
                className={cn(
                    button,
                    oneToOne &&
                        'bg-primary text-primary-foreground hover:bg-primary'
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
                    button,
                    oneToMany &&
                        'bg-primary text-primary-foreground hover:bg-primary'
                )}
                onClick={() =>
                    storeApi
                        .getState()
                        .edit(planSetCardinality(link, 'one-to-many'))
                }
            >
                {t('canvas.link.popover.oneToMany')}
            </button>
            <button
                type="button"
                aria-label={t('canvas.link.popover.switch')}
                title={t('canvas.link.popover.switch')}
                className={button}
                onClick={() => storeApi.getState().edit(planSwitchLink(link))}
            >
                <ArrowLeftRight className="h-3.5 w-3.5" />
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
                <PanelRight className="h-3.5 w-3.5" />
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
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
