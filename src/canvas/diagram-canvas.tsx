import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Background,
    BackgroundVariant,
    ConnectionMode,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useKeyPress,
    useReactFlow,
    useViewport,
} from '@xyflow/react';
import type { Connection, EdgeChange, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from 'zustand';
import { useTranslation } from 'react-i18next';
import type { Id } from '@/core/model/id';
import { cn } from '@/lib/utils/utils';
import { isVisible } from '@/core/model/visibility-filter';
import { traitsOf } from '@/core/model/database';
import { selectLocked } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import {
    arrangeDiagram,
    connectFromHandles,
    copySelection,
    deleteSelection,
    isUsableConnection,
    pasteClipboard,
} from './canvas-actions';
import { ArrangeConfirm } from './arrange-confirm';
import { dropNewItem, NEW_ITEM_TYPE } from './drop-items';
import { ChromeStyle } from './chrome-style';
import {
    MINIMAP_BACKGROUND,
    MINIMAP_MASK,
    MINIMAP_WINDOW,
    miniFill,
    miniStroke,
} from './minimap-colors';
import { CornerTools } from './corner-tools';
import { filterHidesSomething } from './filter-state';
import { Toolbar } from './toolbar';
import { buildMenu } from './menu-model';
import type { MenuTarget } from './menu-model';
import { runMenuAction } from './menu-actions';
import { PointerMenu } from './pointer-menu';
import { useLongPress } from './use-long-press';
import { MarkerDefs } from './cardinality-markers';
import { commitQuickLink, suggestTarget } from './link-draft';
import { LinkDraftLayer } from './link-draft-layer';
import { LinkPopover } from './link-popover';
import { reportConnect, reportCopied, reportPasted } from './notify';
import { commitShapes } from './commit-shapes';
import { buildEdges, buildNodes, drawnEntityIds, NO_LIVE } from './flow-model';
import type { LiveShapes, Point, Side } from './flow-model';
import {
    anyOnScreen,
    overlappingIds,
    resizedEnough,
    sizeFor,
} from './geometry';
import { interactionProps } from './interaction';
import { DEFAULT_PREFS, HooksContext } from './hooks';
import type { CanvasHooks, CanvasPrefs } from './hooks';
import { isMacPlatform, isTypingTarget, hasMod } from './keyboard';
import { createMeasureBook } from './measure-book';
import { edgeTypes } from './edge-types';
import { nodeTypes } from './node-types';
import { SurfaceContext } from './surface-context';
import type { SurfaceApi } from './surface-context';
import { useViewportControls } from './use-viewport';
import type { CanvasControls } from './use-viewport';

const FLASH_MS = 600;

export interface DiagramCanvasProps {
    hooks?: CanvasHooks;
    prefs?: Partial<CanvasPrefs>;
    /** true while the design is still being read: a badge shows */
    loading?: boolean;
    className?: string;
    /** called once, inside the flow provider, with stable camera functions */
    onReady?(controls: CanvasControls): void;
}

function Surface({
    hooks,
    prefs: prefsGiven,
    loading,
    className,
    onReady,
}: DiagramCanvasProps) {
    const { t } = useTranslation();
    const storeApi = useEditorStoreApi();
    const prefs = useMemo(
        () => ({ ...DEFAULT_PREFS, ...prefsGiven }),
        [prefsGiven]
    );
    const [measures] = useState(createMeasureBook);
    const sizes = useStore(measures, (s) => s.sizes);

    const stored = useEditorStore((s) => s.design);
    const diff = hooks?.diff;
    const design = diff?.design ?? stored;
    const selection = useEditorStore((s) => s.ui.selection);
    const filter = useEditorStore((s) => s.ui.filter);
    const locked = useEditorStore(selectLocked);
    // a preview draws tables the store does not have: nothing moves meanwhile
    const editable = !locked && !diff;

    const [live, setLive] = useState<LiveShapes>(NO_LIVE);
    const liveRef = useRef<LiveShapes>(NO_LIVE);
    const changeLive = useCallback((next: LiveShapes) => {
        liveRef.current = next;
        setLive(next);
    }, []);

    const measure = useCallback(
        (entity: Parameters<typeof sizeFor>[0]) =>
            sizeFor(entity, measures.getState().sizes),
        [measures]
    );

    const visible = useMemo(() => {
        const defaultSchema = traitsOf(design.databaseType).defaultSchema;
        return drawnEntityIds(
            design,
            (id) => isVisible(filter, design.entities.byId[id], defaultSchema),
            prefs.showViews
        );
    }, [design, filter, prefs.showViews]);

    const selected = useMemo(() => new Set(selection), [selection]);
    const none = useMemo(() => new Set<Id>(), []);

    // tables whose boxes touch (EDT-038, EDT-039); the toolbar flashes them
    const overlapNow = useMemo(
        () =>
            overlappingIds(
                [...visible].map((id) => {
                    const entity = design.entities.byId[id];
                    return {
                        id,
                        box: {
                            x: entity.x,
                            y: entity.y,
                            ...sizeFor(entity, sizes),
                        },
                    };
                })
            ),
        [design.entities, visible, sizes]
    );
    // the same members give the same set, so a new measurement alone does not
    // rebuild every node
    const overlapKey = [...overlapNow].sort().join('|');
    const overlapping = useMemo(
        () => new Set(overlapKey ? overlapKey.split('|') : []),
        [overlapKey]
    );
    const [flashing, setFlashing] = useState<ReadonlySet<Id>>(none);
    const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(flashTimer.current), []);
    const flashOverlaps = useCallback(() => {
        clearTimeout(flashTimer.current);
        setFlashing(overlapping);
        flashTimer.current = setTimeout(() => setFlashing(none), FLASH_MS);
    }, [overlapping, none]);

    const input = useMemo(
        () => ({
            design,
            selection: selected,
            visible,
            live,
            flashing,
            overlapping,
            sizes,
            outlineOverlaps: prefs.outlineOverlaps,
            editable,
            diff,
        }),
        [
            design,
            selected,
            visible,
            live,
            flashing,
            overlapping,
            sizes,
            prefs.outlineOverlaps,
            editable,
            diff,
        ]
    );
    const nodes = useMemo(() => buildNodes(input), [input]);
    const sideMemory = useRef(new Map<Id, [Side, Side]>());
    const edges = useMemo(() => buildEdges(input, sideMemory.current), [input]);

    const controls = useViewportControls([...visible], storeApi);

    // hand the camera to the frame once; the functions never change
    const readyRef = useRef(onReady);
    readyRef.current = onReady;
    useEffect(() => {
        readyRef.current?.({
            fit: () => controls.fit(),
            zoomToIds: (ids) => controls.zoomToIds(ids),
            viewportOrigin: () => controls.viewportOrigin(),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // the view refits after the filter changes (EDT-073)
    const firstFilter = useRef(true);
    useEffect(() => {
        if (firstFilter.current) {
            firstFilter.current = false;
            return;
        }
        controls.fit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            let positions = liveRef.current.positions;
            let moved = false;
            const choice = new Set(storeApi.getState().ui.selection);
            let choiceChanged = false;
            for (const change of changes) {
                if (change.type === 'position' && change.position) {
                    positions = { ...positions, [change.id]: change.position };
                    moved = true;
                } else if (change.type === 'dimensions' && change.dimensions) {
                    if (storeApi.getState().design.entities.byId[change.id])
                        measures
                            .getState()
                            .report(change.id, change.dimensions);
                } else if (change.type === 'select') {
                    if (change.selected && !choice.has(change.id)) {
                        choice.add(change.id);
                        choiceChanged = true;
                    } else if (!change.selected && choice.delete(change.id)) {
                        choiceChanged = true;
                    }
                }
            }
            if (moved) changeLive({ ...liveRef.current, positions });
            if (choiceChanged) storeApi.getState().select([...choice]);
        },
        [storeApi, measures, changeLive]
    );

    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const choice = new Set(storeApi.getState().ui.selection);
            let changed = false;
            for (const change of changes) {
                if (change.type !== 'select') continue;
                if (change.selected && !choice.has(change.id)) {
                    choice.add(change.id);
                    changed = true;
                } else if (!change.selected && choice.delete(change.id)) {
                    changed = true;
                }
            }
            if (changed) storeApi.getState().select([...choice]);
        },
        [storeApi]
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            const outcome = connectFromHandles(storeApi, connection);
            if (outcome) reportConnect(outcome);
        },
        [storeApi]
    );

    const finishGesture = useCallback(() => {
        const shapes = liveRef.current;
        changeLive(NO_LIVE);
        const state = storeApi.getState();
        const command = commitShapes(state.design, shapes, measure);
        if (command) state.edit(command);
    }, [storeApi, measure, changeLive]);

    const shiftHeld = useKeyPress('Shift');

    const [editingId, setEditingId] = useState<Id>();
    const [renamingId, setRenamingId] = useState<Id>();
    const [popover, setPopover] = useState<{ linkId: Id; at: Point }>();
    const [draftFrom, setDraftFrom] = useState<Id>();
    const [pending, setPending] = useState<{
        sourceId: Id;
        targetId: Id;
        anchor: Point;
    }>();
    const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
    const flow = useReactFlow();
    const [menu, setMenu] = useState<{
        page: Point;
        at: Point;
        target: MenuTarget;
    }>();
    const [confirming, setConfirming] = useState(false);

    const beginLink = useCallback((entityId: Id) => {
        setEditingId(undefined);
        setPending(undefined);
        setDraftFrom(entityId);
    }, []);
    const cancelDraft = useCallback(() => {
        setDraftFrom(undefined);
        setPending(undefined);
    }, []);

    const openMenu = useCallback(
        (page: Point, target: MenuTarget) => {
            if (!editable || target.kind === 'memo') return;
            if (
                target.kind === 'entity' &&
                !storeApi.getState().ui.selection.includes(target.id)
            )
                storeApi.getState().select([target.id]);
            setMenu({
                page,
                at: flow.screenToFlowPosition(page),
                target,
            });
        },
        [editable, storeApi, flow]
    );
    const targetOfElement = useCallback(
        (element: Element): MenuTarget => {
            const id = element
                .closest('.react-flow__node')
                ?.getAttribute('data-id');
            const state = storeApi.getState().design;
            if (id && state.entities.byId[id]) return { kind: 'entity', id };
            if (id && state.regions.byId[id]) return { kind: 'region', id };
            if (id && state.memos.byId[id]) return { kind: 'memo', id };
            return { kind: 'pane' };
        },
        [storeApi]
    );
    useLongPress(
        hostEl,
        editable,
        useCallback(
            (page: Point, element: Element) =>
                openMenu(page, targetOfElement(element)),
            [openMenu, targetOfElement]
        )
    );

    const confirmArrange = () => {
        setConfirming(false);
        arrangeDiagram(storeApi, { ids: visible }, measure);
        controls.fit();
    };

    // the target table was clicked: ask the workspace's card, or just use the suggestion
    const pickTarget = useCallback(
        (targetId: Id, anchor: Point) => {
            if (!draftFrom) return;
            if (hooks?.renderLinkCard) {
                setPending({ sourceId: draftFrom, targetId, anchor });
                setDraftFrom(undefined);
                return;
            }
            const suggestion = suggestTarget(
                storeApi.getState().design,
                draftFrom,
                targetId
            );
            if (suggestion)
                commitQuickLink(
                    storeApi,
                    draftFrom,
                    targetId,
                    suggestion.choice
                );
            setDraftFrom(undefined);
        },
        [draftFrom, hooks, storeApi]
    );

    // keys that act on the canvas: fit, delete, escape
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (hasMod(event) && event.key === '0') {
                event.preventDefault();
                controls.fit();
                return;
            }
            if (event.key === 'Escape') {
                cancelDraft();
                setPopover(undefined);
                setEditingId(undefined);
                setRenamingId(undefined);
                return;
            }
            if (isTypingTarget(event.target)) return;
            if (hasMod(event) && event.key.toLowerCase() === 'c') {
                if (window.getSelection()?.toString()) return;
                const count = copySelection(storeApi);
                if (count > 0) reportCopied(count);
                return;
            }
            if (hasMod(event) && event.key.toLowerCase() === 'v' && editable) {
                const count = pasteClipboard(storeApi, measure);
                if (count > 0) reportPasted(count);
                return;
            }
            if (
                (event.key === 'Delete' || event.key === 'Backspace') &&
                editable
            ) {
                if (deleteSelection(storeApi)) event.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [controls, editable, storeApi, cancelDraft, measure]);

    const surface = useMemo<SurfaceApi>(
        () => ({
            prefs,
            editable,
            editingId,
            startEditing: setEditingId,
            stopEditing: () => setEditingId(undefined),
            renamingId,
            startRename: setRenamingId,
            stopRename: () => setRenamingId(undefined),
            resizeLive: (id, box) =>
                changeLive({
                    positions: {
                        ...liveRef.current.positions,
                        [id]: { x: box.x, y: box.y },
                    },
                    sizes: {
                        ...liveRef.current.sizes,
                        [id]: { width: box.width, height: box.height },
                    },
                }),
            resizeEnd: finishGesture,
            openLinkPopover: (linkId, at) => setPopover({ linkId, at }),
            linkSourceId: draftFrom,
            beginLink,
        }),
        [
            prefs,
            editable,
            editingId,
            renamingId,
            draftFrom,
            changeLive,
            finishGesture,
            beginLink,
        ]
    );

    const [snapOn, setSnapOn] = useState(false);
    const view = useViewport();
    const hidesSome = useMemo(
        () => filterHidesSomething(design, filter),
        [design, filter]
    );
    // the way back when the person has panned away from every table (EDT-023)
    const lost = useMemo(() => {
        if (visible.size === 0 || !hostEl) return false;
        const boxes = [...visible].map((id) => {
            const entity = design.entities.byId[id];
            return {
                x: entity.x,
                y: entity.y,
                ...sizeFor(entity, sizes),
            };
        });
        return !anyOnScreen(boxes, view, {
            width: hostEl.offsetWidth,
            height: hostEl.offsetHeight,
        });
    }, [visible, design.entities, sizes, view, hostEl]);

    // First sight of the tables: fit once every drawn table has a measured size.
    // Later, a container that changes size a lot refits, unless the person has
    // panned or zoomed since the last fit.
    const fittedOnce = useRef(false);
    const touched = useRef(false);
    const lastBox = useRef<{ w: number; h: number } | undefined>(undefined);
    useEffect(() => {
        if (fittedOnce.current || visible.size === 0) return;
        if (![...visible].every((id) => sizes[id])) return;
        fittedOnce.current = true;
        controls.fit({ instant: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, sizes]);
    useEffect(() => {
        if (!hostEl || typeof ResizeObserver === 'undefined') return;
        const watcher = new ResizeObserver(() => {
            const w = hostEl.offsetWidth;
            const h = hostEl.offsetHeight;
            const before = lastBox.current;
            if (!before) {
                lastBox.current = { w, h };
                return;
            }
            if (!resizedEnough(before, { w, h })) return;
            lastBox.current = { w, h };
            if (!touched.current && fittedOnce.current)
                controls.fit({ instant: true });
        });
        watcher.observe(hostEl);
        return () => watcher.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostEl]);

    const everythingHidden =
        design.entities.order.length > 0 && visible.size === 0;

    return (
        <HooksContext.Provider value={hooks ?? {}}>
            <SurfaceContext.Provider value={surface}>
                <div
                    data-testid="diagram-canvas"
                    aria-label={t('canvas.surface.label')}
                    ref={setHostEl}
                    onDragOver={(event) => {
                        if (
                            editable &&
                            event.dataTransfer.types.includes(NEW_ITEM_TYPE)
                        ) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'copy';
                        }
                    }}
                    onDrop={(event) => {
                        const kind = event.dataTransfer.getData(NEW_ITEM_TYPE);
                        if (!editable || !kind) return;
                        event.preventDefault();
                        dropNewItem(
                            storeApi,
                            kind,
                            flow.screenToFlowPosition({
                                x: event.clientX,
                                y: event.clientY,
                            }),
                            hooks?.visibleSchemas,
                            measure
                        );
                    }}
                    data-multiselect={shiftHeld}
                    className={cn(
                        'relative h-full w-full',
                        shiftHeld && '[&_.react-flow__pane]:!cursor-crosshair',
                        className
                    )}
                >
                    <ChromeStyle />
                    <MarkerDefs />
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        isValidConnection={isUsableConnection}
                        onEdgeDoubleClick={(event, edge) =>
                            editable &&
                            setPopover({
                                linkId: edge.id,
                                at: { x: event.clientX, y: event.clientY },
                            })
                        }
                        onNodeClick={(event, node) => {
                            if (draftFrom && node.type === 'entity')
                                pickTarget(node.id, {
                                    x: event.clientX,
                                    y: event.clientY,
                                });
                        }}
                        onPaneContextMenu={(event) => {
                            event.preventDefault();
                            openMenu(
                                { x: event.clientX, y: event.clientY },
                                { kind: 'pane' }
                            );
                        }}
                        onNodeContextMenu={(event, node) => {
                            event.preventDefault();
                            const kind = node.type as
                                'entity' | 'region' | 'memo';
                            openMenu(
                                { x: event.clientX, y: event.clientY },
                                { kind, id: node.id }
                            );
                        }}
                        onPaneClick={() => {
                            setMenu(undefined);
                            cancelDraft();
                            setPopover(undefined);
                            setEditingId(undefined);
                        }}
                        onNodeDragStop={finishGesture}
                        {...interactionProps(prefs, {
                            editable,
                            shiftHeld: shiftHeld || snapOn,
                        })}
                        connectionMode={ConnectionMode.Loose}
                        onlyRenderVisibleElements
                        onMoveStart={(event) => {
                            // a null event is a camera move made by code, not by the person
                            if (event) touched.current = true;
                        }}
                        onMove={(_, viewport) =>
                            storeApi.getState().setZoom(viewport.zoom)
                        }
                        attributionPosition="bottom-right"
                        className={isMacPlatform() ? 'mac' : undefined}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={16}
                            size={1.2}
                        />
                        {prefs.showMiniMap ? (
                            <MiniMap
                                pannable
                                zoomable
                                className="qb-minimap"
                                style={{ background: MINIMAP_BACKGROUND }}
                                maskColor={MINIMAP_MASK}
                                maskStrokeColor={MINIMAP_WINDOW}
                                maskStrokeWidth={2}
                                nodeStrokeWidth={2}
                                nodeBorderRadius={3}
                                nodeColor={(node) =>
                                    miniFill(design, node.id, node.type)
                                }
                                nodeStrokeColor={(node) =>
                                    miniStroke(design, node.id, node.type)
                                }
                            />
                        ) : null}
                    </ReactFlow>
                    <CornerTools
                        editable={editable}
                        snapOn={snapOn}
                        onSnap={() => setSnapOn((on) => !on)}
                        overlapping={overlapping.size > 0}
                        onFlashOverlaps={flashOverlaps}
                        highlight={hooks?.highlight}
                    />
                    {lost ? (
                        <button
                            type="button"
                            className="qb-pill rounded-full border bg-card px-3 py-1 text-xs shadow-md hover:bg-muted"
                            onClick={() => controls.fit()}
                        >
                            {t('canvas.showAllPill')}
                        </button>
                    ) : null}
                    <Toolbar
                        filterActive={hidesSome}
                        filterOpen={hooks?.filterPanelOpen}
                        editable={editable}
                        onFilter={hooks?.toggleFilterPanel}
                        onShowAll={() => controls.fit()}
                        onZoomIn={controls.zoomIn}
                        onZoomOut={controls.zoomOut}
                        onResetZoom={controls.resetZoom}
                        onArrange={() => setConfirming(true)}
                    />
                    {draftFrom ? (
                        <LinkDraftLayer
                            sourceId={draftFrom}
                            container={hostEl}
                        />
                    ) : null}
                    {pending && hooks?.renderLinkCard
                        ? hooks.renderLinkCard({
                              sourceEntityId: pending.sourceId,
                              targetEntityId: pending.targetId,
                              anchor: pending.anchor,
                              done: (createdLinkId) => {
                                  setPending(undefined);
                                  if (createdLinkId)
                                      storeApi
                                          .getState()
                                          .select([createdLinkId]);
                              },
                          })
                        : null}
                    {menu ? (
                        <PointerMenu
                            at={menu.page}
                            lines={buildMenu({
                                design,
                                selection,
                                target: menu.target,
                                at: menu.at,
                                showViews: prefs.showViews,
                                canOpenLinkDialog: !!hooks?.openLinkDialog,
                                canEditEntity: !!hooks?.renderEntityEditor,
                            })}
                            onClose={() => setMenu(undefined)}
                            onPick={(action) =>
                                runMenuAction(action, {
                                    store: storeApi,
                                    measure,
                                    visibleSchemas: hooks?.visibleSchemas,
                                    drawn: visible,
                                    openLinkDialog: hooks?.openLinkDialog,
                                    startEditing: setEditingId,
                                    startRename: setRenamingId,
                                    beginLink,
                                    askArrange: () => setConfirming(true),
                                })
                            }
                        />
                    ) : null}
                    <ArrangeConfirm
                        open={confirming}
                        onConfirm={confirmArrange}
                        onCancel={() => setConfirming(false)}
                    />
                    {popover ? (
                        <LinkPopover
                            linkId={popover.linkId}
                            at={popover.at}
                            onClose={() => setPopover(undefined)}
                        />
                    ) : null}
                    {loading ? (
                        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
                            {t('canvas.surface.loading')}
                        </div>
                    ) : null}
                    {everythingHidden ? (
                        <div
                            role="status"
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                        >
                            <p className="text-sm text-muted-foreground">
                                {t('canvas.hiddenAll.title')}
                            </p>
                            <button
                                type="button"
                                className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
                                onClick={() =>
                                    storeApi.getState().setFilter({})
                                }
                            >
                                {t('canvas.hiddenAll.action')}
                            </button>
                        </div>
                    ) : null}
                </div>
            </SurfaceContext.Provider>
        </HooksContext.Provider>
    );
}

/** The diagram surface. It reads and edits the editor store it sits inside. */
export function DiagramCanvas(props: DiagramCanvasProps) {
    return (
        <ReactFlowProvider>
            <Surface {...props} />
        </ReactFlowProvider>
    );
}
