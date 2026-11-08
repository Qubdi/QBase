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
import type { CanvasControls } from '@/canvas/use-viewport';
import { LocalConfigContext } from '@/context/local-config-context/local-config-context';
import { usePreviewStore } from '@/features/dbml-diff/preview-store';
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

const Surface: React.FC = () => {
    const root = useRef<HTMLDivElement>(null);
    const store = useEditorStoreApi();
    const config = useContext(LocalConfigContext);
    const design = useEditorStore(selectDesign);
    const filter = useEditorStore(selectFilter);
    const diff = usePreviewStore((s) => s.marks);
    const highlightName = useEditorStore((s) =>
        s.ui.highlightedTypeId
            ? s.design.userTypes.byId[s.ui.highlightedTypeId]?.name
            : undefined
    );
    const [filterOpen, setFilterOpen] = useState(false);
    const [linkDialog, setLinkDialog] = useState(false);
    // the canvas hands these over once it is mounted (fit, zoom to tables, view origin)
    const controls = useRef<CanvasControls | null>(null);
    const onReady = useCallback((next: CanvasControls) => {
        controls.current = next;
    }, []);

    const toggleFilter = useCallback(() => setFilterOpen((open) => !open), []);
    useRegisterCanvas({
        fitAll: () => controls.current?.fit(),
        toggleFilter,
        captureTarget: () => root.current,
        viewportOrigin: () =>
            controls.current?.viewportOrigin() ?? { x: 0, y: 0 },
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
            diff,
            highlight:
                highlightName === undefined
                    ? undefined
                    : {
                          label: highlightName,
                          clear: () =>
                              store.getState().setHighlightedType(undefined),
                      },
        }),
        [store, toggleFilter, filterOpen, schemas, diff, highlightName]
    );

    return (
        <div
            ref={root}
            data-slot="canvas"
            className="relative h-full w-full bg-muted/30"
        >
            <DiagramCanvas hooks={hooks} prefs={prefs} onReady={onReady} />
            {filterOpen ? (
                <div className="absolute bottom-4 right-4 top-4 z-40">
                    <FilterPanel
                        onClose={() => setFilterOpen(false)}
                        onZoomToGroup={(ids) =>
                            controls.current?.zoomToIds(ids)
                        }
                    />
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
