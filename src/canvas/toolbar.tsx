import React from 'react';
import {
    LayoutGrid,
    Minus,
    Plus,
    Redo2,
    Scan,
    Search,
    Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/utils';
import { selectCanRedo, selectCanUndo, selectZoom } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { shortcutLabel } from './keyboard';

export interface ToolbarProps {
    /** the filter hides some table */
    filterActive: boolean;
    filterOpen?: boolean;
    editable: boolean;
    onFilter?(): void;
    onShowAll(): void;
    onZoomIn(): void;
    onZoomOut(): void;
    onResetZoom(): void;
    onArrange(): void;
}

const base =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm transition-colors hover:bg-accent hover:font-medium hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40';

/** The accessible name is the plain label; the shortcut belongs to the tooltip only. */
const plain = (label: string) => label.replace(/\s*[(（][^)）]*[)）]\s*$/, '');

function Divider() {
    return <span aria-hidden className="h-9 w-px shrink-0 bg-border" />;
}

/**
 * The floating bar: filter, show all, zoom, auto arrange, undo and redo
 * (EDT-040). Bottom-centre on a wide window, top-centre on a narrow one.
 */
export function Toolbar(props: ToolbarProps) {
    const { t } = useTranslation();
    const storeApi = useEditorStoreApi();
    const zoom = useEditorStore(selectZoom);
    const canUndo = useEditorStore(selectCanUndo);
    const canRedo = useEditorStore(selectCanRedo);

    return (
        <div
            role="toolbar"
            aria-label={t('canvas.toolbar.label')}
            className="qb-toolbar flex items-center h-11 rounded-xl border bg-secondary p-1"
        >
            <button
                type="button"
                className={cn(
                    base,
                    props.filterActive &&
                        'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
                aria-pressed={props.filterOpen}
                aria-label={plain(
                    t('canvas.toolbar.filter', {
                        shortcut: shortcutLabel(['Mod', 'F']),
                    })
                )}
                title={t('canvas.toolbar.filter', {
                    shortcut: shortcutLabel(['Mod', 'F']),
                })}
                data-active={props.filterActive}
                disabled={!props.onFilter}
                onClick={props.onFilter}
            >
                <Search className="h-4 w-4" />
            </button>
            <Divider />
            <button
                type="button"
                className={base}
                aria-label={plain(
                    t('canvas.toolbar.showAll', {
                        shortcut: shortcutLabel(['Mod', '0']),
                    })
                )}
                title={t('canvas.toolbar.showAll', {
                    shortcut: shortcutLabel(['Mod', '0']),
                })}
                onClick={props.onShowAll}
            >
                <Scan className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={base}
                aria-label={t('canvas.toolbar.zoomOut')}
                title={t('canvas.toolbar.zoomOut')}
                onClick={props.onZoomOut}
            >
                <Minus className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={cn(base, 'w-[60px] tabular-nums')}
                aria-label={t('canvas.toolbar.zoomReset')}
                title={t('canvas.toolbar.zoomReset')}
                onClick={props.onResetZoom}
            >
                {Math.round(zoom * 100)}%
            </button>
            <button
                type="button"
                className={base}
                aria-label={t('canvas.toolbar.zoomIn')}
                title={t('canvas.toolbar.zoomIn')}
                onClick={props.onZoomIn}
            >
                <Plus className="h-4 w-4" />
            </button>
            {props.editable ? (
                <>
                    <Divider />
                    <button
                        type="button"
                        className={base}
                        aria-label={t('canvas.toolbar.arrange')}
                        title={t('canvas.toolbar.arrange')}
                        onClick={props.onArrange}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </button>
                </>
            ) : null}
            <Divider />
            <button
                type="button"
                className={base}
                disabled={!canUndo}
                aria-label={plain(
                    t('canvas.toolbar.undo', {
                        shortcut: shortcutLabel(['Mod', 'Z']),
                    })
                )}
                title={t('canvas.toolbar.undo', {
                    shortcut: shortcutLabel(['Mod', 'Z']),
                })}
                onClick={() => storeApi.getState().undo()}
            >
                <Undo2 className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={base}
                disabled={!canRedo}
                aria-label={plain(
                    t('canvas.toolbar.redo', {
                        shortcut: shortcutLabel(['Mod', 'Shift', 'Z']),
                    })
                )}
                title={t('canvas.toolbar.redo', {
                    shortcut: shortcutLabel(['Mod', 'Shift', 'Z']),
                })}
                onClick={() => storeApi.getState().redo()}
            >
                <Redo2 className="h-4 w-4" />
            </button>
        </div>
    );
}
