import React, {
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { DiagramCanvas } from '@/canvas/diagram-canvas';
import type { CanvasHooks, CanvasPrefs } from '@/canvas/hooks';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { FilterPanel } from '@/features/filters/filter-panel';
import { CreateLinkDialog } from '@/features/links/create-link-dialog';
import { visibleSchemas } from '@/features/tables/table-list';
import { selectDesign, selectFilter } from '@/store/selectors';
import {
    useEditorStore,
    useEditorStoreApi,
    useOptionalEditorStoreApi,
} from '@/store/store-context';
import { useRegisterCanvas } from './canvas-bridge-context';
import { EntityEditor } from './entity-editor';
import { QuickLinkCard } from './quick-link-card';

/** The canvas takes Mod+0 itself (it is the only listener), so Show All from a menu sends it. */
function pressFitKey(): void {
    window.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: '0',
            ctrlKey: true,
            metaKey: true,
            bubbles: true,
            cancelable: true,
        })
    );
}

/** The top-left corner of what the canvas shows, in canvas coordinates. */
function originOf(root: HTMLElement | null): { x: number; y: number } {
    const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport');
    const match =
        /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(\s*([\d.]+)\s*\)/.exec(
            viewport?.style.transform ?? ''
        );
    if (!match) return { x: 0, y: 0 };
    const zoom = Number(match[3]) || 1;
    return { x: -Number(match[1]) / zoom, y: -Number(match[2]) / zoom };
}

const Surface: React.FC = () => {
    const root = useRef<HTMLDivElement>(null);
    const store = useEditorStoreApi();
    const config = useContext(LocalConfigContext);
    const design = useEditorStore(selectDesign);
    const filter = useEditorStore(selectFilter);
    const [filterOpen, setFilterOpen] = useState(false);
    const [linkDialog, setLinkDialog] = useState(false);

    const toggleFilter = useCallback(() => setFilterOpen((open) => !open), []);
    useRegisterCanvas({
        fitAll: pressFitKey,
        toggleFilter,
        captureTarget: () => root.current,
        viewportOrigin: () => originOf(root.current),
    });

    const prefs = useMemo<CanvasPrefs>(
        () => ({
            zoomOnScroll: config.scrollAction === 'zoom',
            showMiniMap: config.showMinimap,
            showCardinality: config.showCardinality,
            showFieldAttributes: config.showFieldAttributes,
            compact: config.compactTables,
            showViews: config.showDbViews,
            outlineOverlaps: config.outlineOverlaps,
        }),
        [config]
    );

    const schemas = useMemo(
        () => visibleSchemas(design, filter, config.showDbViews),
        [design, filter, config.showDbViews]
    );

    const hooks = useMemo<CanvasHooks>(
        () => ({
            openLinkDialog: () => setLinkDialog(true),
            showLinkInPanel: (linkId) => {
                const state = store.getState();
                state.select([linkId]);
                state.showPanel('refs');
            },
            renderEntityEditor: (props) => <EntityEditor {...props} />,
            renderLinkCard: (props) => <QuickLinkCard {...props} />,
            toggleFilterPanel: toggleFilter,
            filterPanelOpen: filterOpen,
            visibleSchemas: schemas,
        }),
        [store, toggleFilter, filterOpen, schemas]
    );

    return (
        <div
            ref={root}
            data-slot="canvas"
            className="relative h-full w-full bg-muted/30"
        >
            <DiagramCanvas hooks={hooks} prefs={prefs} />
            {filterOpen ? (
                <div className="absolute left-3 top-3 z-40">
                    <FilterPanel onClose={() => setFilterOpen(false)} />
                </div>
            ) : null}
            {linkDialog ? (
                <CreateLinkDialog
                    onClose={() => setLinkDialog(false)}
                    onCreated={(id) => store.getState().select([id])}
                />
            ) : null}
        </div>
    );
};

/**
 * Where the canvas goes: the diagram surface over the editor store, the Filter
 * Tables panel and the Create Relationship dialog. Until the store exists (the
 * diagram is still being read) the place shows a loading line.
 */
export const CanvasSlot: React.FC = () => {
    const { t } = useTranslation();
    const store = useOptionalEditorStoreApi();
    if (store) return <Surface />;
    return (
        <div
            data-slot="canvas"
            className="relative flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground"
        >
            {t('editor.workspace.canvas.loading')}
        </div>
    );
};
