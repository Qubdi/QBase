import { PoweredByMark } from '@/components/qubdi/powered-by';
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
    Panel,
    ReactFlow,
    ReactFlowProvider,
    useKeyPress,
    useReactFlow,
    useUpdateNodeInternals,
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
    connectDependency,
    connectFromHandles,
    copySelection,
    deleteSelection,
    isUsableConnection,
    pasteClipboard,
} from './canvas-actions';
import { ArrangeConfirm } from './arrange-confirm';
import { dropNewItem, NEW_ITEM_TYPE } from './drop-items';
import { ChromeStyle, DropTargetStyle } from './chrome-style';
import {
    MINIMAP_BACKGROUND,
    MINIMAP_MASK,
    MINIMAP_WINDOW,
    MINIMAP_NODE,
    MINIMAP_NODE_STROKE,
} from './minimap-colors';
import { CornerTools } from './corner-tools';
import { filterHidesSomething } from './filter-state';
import { Toolbar } from './toolbar';
import { TypeLegend } from './type-legend';
import { buildMenu } from './menu-model';
import type { MenuTarget } from './menu-model';
import { runMenuAction } from './menu-actions';
import { PointerMenu } from './pointer-menu';
import { useLongPress } from './use-long-press';
import { commitQuickLink, suggestTarget } from './link-draft';
import { LinkDraftLayer } from './link-draft-layer';
import { HANDLES_MIN_ZOOM } from './field-row';
import { LinkPopover } from './link-popover';
import { reportConnect, reportCopied, reportPasted } from './notify';
import { commitShapes } from './commit-shapes';
import {
    buildDependencyEdges,
    buildEdges,
    buildNodes,
    drawnEntityIds,
    inOrder,
    NO_LIVE,
    parseDependencyHandle,
    readingOrder,
} from './flow-model';
import type {
    LinkEdge,
    LiveShapes,
    NodeMemory,
    Point,
    Side,
} from './flow-model';
import {
    anyOnScreen,
    overlapCounts as countOverlaps,
    resizedEnough,
    revealShift,
    sizeFor,
} from './geometry';
import { interactionProps } from './interaction';
import { DEFAULT_PREFS, HooksContext } from './hooks';
import type { CanvasHooks, CanvasPrefs } from './hooks';
import {
    canvasKeysAllowed,
    escapeIsFree,
    hasMod,
    isMacPlatform,
    isTypingTarget,
} from './keyboard';
import { useFullRender } from './capture-mode';
import { createMeasureBook } from './measure-book';
import { edgeTypes } from './edge-types';
import { nodeTypes } from './node-types';
import { SurfaceContext } from './surface-context';
import type { SurfaceApi } from './surface-context';
import { useViewportControls } from './use-viewport';
import type { CanvasControls } from './use-viewport';

const FLASH_MS = 600;
const SAFE_MARGIN = 12;

/**
 * The part of the canvas a card may use: the whole of it, less a margin and less
 * the toolbar, which sits at the bottom on a wide window and at the top on a phone.
 */
function safeArea(host: HTMLElement) {
    const box = host.getBoundingClientRect();
    const safe = {
        left: box.left + SAFE_MARGIN,
        top: box.top + SAFE_MARGIN,
        right: box.right - SAFE_MARGIN,
        bottom: box.bottom - SAFE_MARGIN,
    };
    const bar = host.querySelector('.qb-toolbar')?.getBoundingClientRect();
    if (bar && bar.height > 0) {
        if (bar.top + bar.height / 2 > box.top + box.height / 2)
            safe.bottom = Math.min(safe.bottom, bar.top - SAFE_MARGIN);
        else safe.top = Math.max(safe.top, bar.bottom + SAFE_MARGIN);
    }
    return safe;
}
/** After the last arrow key goes up, this long later the moves are saved. */
export const ARROW_COMMIT_MS = 300;

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
    const flow = useReactFlow();
    const prefs = useMemo(
        () => ({ ...DEFAULT_PREFS, ...prefsGiven }),
        [prefsGiven]
    );
    const [measures] = useState(createMeasureBook);
    const sizes = useStore(measures, (s) => s.sizes);

    const stored = useEditorStore((s) => s.design);
    const diff = hooks?.diff;
    const design = diff?.design ?? stored;
    const diffRef = useRef(diff);
    diffRef.current = diff;
    const selection = useEditorStore((s) => s.ui.selection);
    const filter = useEditorStore((s) => s.ui.filter);
    const locked = useEditorStore(selectLocked);
    const fullRender = useFullRender();
    // a preview draws tables the store does not have: nothing moves meanwhile
    const editable = !locked && !diff;

    const [live, setLive] = useState<LiveShapes>(NO_LIVE);
    const liveRef = useRef<LiveShapes>(NO_LIVE);
    const pointerGesture = useRef(false);
    const markGesture = useCallback((on: boolean) => {
        pointerGesture.current = on;
    }, []);
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

    // tables whose boxes touch (EDT-038, EDT-039); the toolbar highlights them
    const overlapNow = useMemo(
        () =>
            countOverlaps(
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
    // the same members give the same maps, so a new measurement alone does not
    // rebuild every node
    const overlapKey = [...overlapNow]
        .map(([id, n]) => `${id}:${n}`)
        .sort()
        .join('|');
    const overlapCounts = useMemo(
        () =>
            new Map<Id, number>(
                overlapKey
                    ? overlapKey.split('|').map((pair) => {
                          const at = pair.lastIndexOf(':');
                          return [
                              pair.slice(0, at),
                              Number(pair.slice(at + 1)),
                          ] as [Id, number];
                      })
                    : []
            ),
        [overlapKey]
    );
    const overlapping = useMemo(
        () => new Set<Id>(overlapCounts.keys()),
        [overlapCounts]
    );
    const [highlightOverlaps, setHighlightOverlaps] = useState(false);
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
            overlapCounts,
            highlightOverlaps: highlightOverlaps || prefs.outlineOverlaps,
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
            overlapCounts,
            highlightOverlaps,
            sizes,
            prefs.outlineOverlaps,
            editable,
            diff,
        ]
    );
    const nodeMemory = useRef<NodeMemory>(new Map());
    // Tab walks the tables in reading order (top-left to bottom-right). The order
    // is held while a node has the focus: moving the element that holds the focus
    // in the page would drop the focus.
    const tabOrder = useRef<Id[]>([]);
    const nodes = useMemo(() => {
        const built = buildNodes(input, nodeMemory.current);
        const held = tabOrder.current;
        const known = new Set(held);
        const focusedNode =
            typeof document !== 'undefined' &&
            document.activeElement?.closest?.('.react-flow__node');
        if (!(
            focusedNode &&
            held.length === built.length &&
            built.every((n) => known.has(n.id))
        ))
            tabOrder.current = readingOrder(built);
        return inOrder(built, tabOrder.current);
    }, [input]);
    const sideMemory = useRef(new Map<Id, [Side, Side]>());
    const edgeMemory = useRef(new Map<Id, LinkEdge>());
    const edges = useMemo(
        () => [
            ...buildEdges(input, sideMemory.current, edgeMemory.current),
            ...buildDependencyEdges(input),
        ],
        [input]
    );

    const controls = useViewportControls([...visible], storeApi);

    // the unused connection dots come and go with the zoom (field-row.tsx);
    // xyflow measures them again, once for every table
    const detailed = useEditorStore((s) => s.ui.zoom >= HANDLES_MIN_ZOOM);
    const updateInternals = useUpdateNodeInternals();
    const firstDetail = useRef(true);
    useEffect(() => {
        if (firstDetail.current) {
            firstDetail.current = false;
            return;
        }
        updateInternals([...visible]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailed]);

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

    // A table that only the DBML preview has must come into view. The preview is
    // drawn in full (see below) so that every table is measured, then the view
    // fits once for each new set of added tables.
    const addedKey = useMemo(
        () =>
            diff
                ? Object.entries(diff.tables)
                      .filter(([, mark]) => mark === 'added')
                      .map(([id]) => id)
                      .sort()
                      .join('|')
                : '',
        [diff]
    );
    useEffect(() => {
        if (!addedKey) return;
        const ids = addedKey.split('|');
        let frames = 0;
        let raf = 0;
        const tick = () => {
            const measured = ids.every(
                (id) => flow.getNode(id)?.measured?.width
            );
            if (measured || ++frames > 60) {
                controls.fit();
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addedKey]);

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
                    // a table that only the DBML preview draws is measured too:
                    // the minimap and the fit need its size
                    const shown =
                        diffRef.current?.design ?? storeApi.getState().design;
                    if (shown.entities.byId[change.id])
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

    // a drag from a view's top or bottom dot lands on the table under the pointer
    const [dependencyDrag, setDependencyDrag] = useState(false);
    const onConnectStart = useCallback(
        (_: unknown, params: { handleId: string | null }) =>
            setDependencyDrag(
                parseDependencyHandle(params.handleId) !== undefined
            ),
        []
    );
    const onConnectEnd = useCallback(
        (
            event: MouseEvent | TouchEvent,
            state: {
                fromNode: { id: string } | null;
                fromHandle: { id?: string | null } | null;
            }
        ) => {
            setDependencyDrag(false);
            if (
                !state.fromNode ||
                parseDependencyHandle(state.fromHandle?.id) === undefined
            )
                return;
            const point =
                'changedTouches' in event ? event.changedTouches[0] : event;
            if (!point) return;
            const over = document
                .elementFromPoint(point.clientX, point.clientY)
                ?.closest('.react-flow__node-entity');
            const tableId = over?.getAttribute('data-id');
            if (tableId)
                connectDependency(storeApi, state.fromNode.id, tableId);
        },
        [storeApi]
    );

    const finishGesture = useCallback(() => {
        markGesture(false);
        const shapes = liveRef.current;
        changeLive(NO_LIVE);
        const state = storeApi.getState();
        const command = commitShapes(state.design, shapes, measure);
        if (command) state.edit(command);
    }, [storeApi, measure, changeLive, markGesture]);

    // what a screen reader is told: "<name> moved", "<name> selected"
    const [announcement, setAnnouncement] = useState('');
    const announce = useCallback((text: string) => {
        // the same words twice in a row must still be read: alternate an invisible mark
        setAnnouncement((before) => (before === text ? `${text}\u200b` : text));
    }, []);
    const nameOf = useCallback(
        (id: Id): string | undefined => {
            const d = storeApi.getState().design;
            return (
                d.entities.byId[id]?.name ??
                d.regions.byId[id]?.label ??
                (d.memos.byId[id]?.body.trim().slice(0, 60) || undefined)
            );
        },
        [storeApi]
    );

    // xyflow moves a selected table on the arrow keys (5 px, 20 px with Shift)
    // but never reports a drag end; once the key sequence is over the moves
    // become one edit (one undo step)
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arrow = (event: KeyboardEvent) =>
            event.key.startsWith('Arrow') && !isTypingTarget(event.target);
        const down = (event: KeyboardEvent) => {
            if (arrow(event)) clearTimeout(timer);
        };
        const up = (event: KeyboardEvent) => {
            if (!arrow(event)) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (
                    !pointerGesture.current &&
                    Object.keys(liveRef.current.positions).length > 0
                ) {
                    const moved = Object.keys(liveRef.current.positions)
                        .map(nameOf)
                        .filter(Boolean);
                    finishGesture();
                    if (moved.length > 0)
                        announce(
                            t('canvas.a11y.moved', { name: moved.join(', ') })
                        );
                }
            }, ARROW_COMMIT_MS);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [finishGesture, nameOf, announce, t]);

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
    // Lifting the finger after a long press makes the browser send a mouse
    // press and a click at the same spot; they must not close the menu that the
    // hold just opened. Nothing outside closes it while the finger is down and
    // for a moment after it is lifted.
    const quietUntil = useRef(0);
    const outsideIsQuiet = useCallback(
        () => Date.now() < quietUntil.current,
        []
    );
    useLongPress(
        hostEl,
        editable,
        useCallback(
            (page: Point, element: Element) => {
                quietUntil.current = Number.POSITIVE_INFINITY;
                const release = () => {
                    quietUntil.current = Date.now() + 600;
                };
                for (const type of ['touchend', 'touchcancel'])
                    document.addEventListener(type, release, {
                        once: true,
                        capture: true,
                    });
                openMenu(page, targetOfElement(element));
            },
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

    // Keyboard on a table, area or note that holds the focus itself: Enter opens
    // the edit card (or picks the target while a relationship is drawn),
    // Shift+F10 or the Menu key opens the pointer menu, Escape gives the focus
    // back to the canvas. Arrows and Shift+arrows move it (xyflow, see above).
    const onHostKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const el = event.target;
        if (!(el instanceof HTMLElement) || event.defaultPrevented) return;
        const onNode = el.classList.contains('react-flow__node');
        const onHost = el === hostEl;
        if (!onNode && !onHost) return;
        const rect = el.getBoundingClientRect();
        const target: MenuTarget = onNode
            ? targetOfElement(el)
            : { kind: 'pane' };
        const menuKey =
            event.key === 'ContextMenu' ||
            (event.key === 'F10' && event.shiftKey);
        if (menuKey) {
            event.preventDefault();
            openMenu(
                {
                    x: rect.left + (onNode ? 24 : rect.width / 2),
                    y: rect.top + (onNode ? 24 : rect.height / 2),
                },
                target
            );
        } else if (
            event.key === 'Enter' &&
            onNode &&
            target.kind === 'entity'
        ) {
            if (draftFrom) {
                event.preventDefault();
                pickTarget(target.id, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                });
            } else if (editable && hooks?.renderEntityEditor) {
                event.preventDefault();
                setEditingId(target.id);
            }
        } else if (
            event.key === 'Escape' &&
            onNode &&
            !draftFrom &&
            !editingId
        ) {
            // the card or menu that is open takes its own Escape; none: back to the canvas
            hostEl?.focus({ preventScroll: true });
        }
    };
    // Focusing a node with the keyboard selects it, so the arrows move it and
    // the screen reader says which one it is.
    const onHostFocus = (event: React.FocusEvent<HTMLDivElement>) => {
        const el = event.target;
        if (!(el instanceof HTMLElement)) return;
        if (!el.classList.contains('react-flow__node')) return;
        try {
            if (!el.matches(':focus-visible')) return;
        } catch {
            // no :focus-visible here: treat the focus as the keyboard's
        }
        const id = el.getAttribute('data-id');
        if (!id || storeApi.getState().ui.selection.includes(id)) return;
        storeApi.getState().select([id]);
        const name = nameOf(id);
        if (name) announce(t('canvas.a11y.selected', { name }));
    };

    // the edit card closed from the keyboard: the focus goes back to its table
    const viaKeyboard = useRef(false);
    useEffect(() => {
        const key = () => (viaKeyboard.current = true);
        const pointer = () => (viaKeyboard.current = false);
        window.addEventListener('keydown', key, true);
        window.addEventListener('pointerdown', pointer, true);
        return () => {
            window.removeEventListener('keydown', key, true);
            window.removeEventListener('pointerdown', pointer, true);
        };
    }, []);
    const wasEditing = useRef<Id>(undefined);
    useEffect(() => {
        const before = wasEditing.current;
        wasEditing.current = editingId;
        if (!before || editingId || !viaKeyboard.current) return;
        // xyflow blurs the table one frame after an Escape on it: look again then
        const give = () => {
            const active = document.activeElement;
            if (active && active !== document.body) return;
            hostEl
                ?.querySelector<HTMLElement>(
                    `.react-flow__node[data-id="${before}"]`
                )
                ?.focus({ preventScroll: true });
        };
        give();
        const frame = requestAnimationFrame(() => requestAnimationFrame(give));
        return () => cancelAnimationFrame(frame);
    }, [editingId, hostEl]);

    const ariaLabels = useMemo(
        () => ({
            'node.a11yDescription.default': t('canvas.a11y.nodeHint'),
            'node.a11yDescription.keyboardDisabled': t('canvas.a11y.nodeHint'),
            // announced by this canvas ("<name> moved") in the page's language
            'node.a11yDescription.ariaLiveMessage': () => '',
            'edge.a11yDescription.default': t('canvas.a11y.edgeHint'),
        }),
        [t]
    );

    // The edit card must open inside the window and above the toolbar: it is
    // limited in height, then the picture moves just far enough to show all of it.
    const [editMaxHeight, setEditMaxHeight] = useState<number>();
    useEffect(() => {
        // no size, no layout (a test environment): nothing to fit
        if (
            !editingId ||
            !hostEl ||
            hostEl.getBoundingClientRect().width === 0
        ) {
            setEditMaxHeight(undefined);
            return;
        }
        const safe = safeArea(hostEl);
        setEditMaxHeight(
            Math.max(160, (safe.bottom - safe.top) / flow.getZoom())
        );
        let frames = 0;
        let raf = 0;
        const tick = () => {
            if (++frames < 3) {
                raf = requestAnimationFrame(tick);
                return;
            }
            const card = hostEl.querySelector('[data-edit-card]');
            if (!card) return;
            const { dx, dy } = revealShift(
                card.getBoundingClientRect(),
                safeArea(hostEl)
            );
            if (dx === 0 && dy === 0) return;
            const view = flow.getViewport();
            void flow.setViewport(
                { x: view.x + dx, y: view.y + dy, zoom: view.zoom },
                { duration: 200 }
            );
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [editingId, hostEl, flow]);

    // keys that act on the canvas: fit, delete, escape
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (hasMod(event) && event.key === '0') {
                event.preventDefault();
                controls.fit();
                return;
            }
            if (event.key === 'Escape') {
                if (!escapeIsFree(event)) return;
                cancelDraft();
                setPopover(undefined);
                setEditingId(undefined);
                setRenamingId(undefined);
                return;
            }
            if (!canvasKeysAllowed(event)) return;
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
            editMaxHeight,
            renamingId,
            startRename: setRenamingId,
            stopRename: () => setRenamingId(undefined),
            resizeLive: (id, box) => {
                markGesture(true);
                changeLive({
                    positions: {
                        ...liveRef.current.positions,
                        [id]: { x: box.x, y: box.y },
                    },
                    sizes: {
                        ...liveRef.current.sizes,
                        [id]: { width: box.width, height: box.height },
                    },
                });
            },
            resizeEnd: finishGesture,
            openLinkPopover: (linkId, at) => setPopover({ linkId, at }),
            linkSourceId: draftFrom,
            beginLink,
        }),
        [
            prefs,
            editable,
            editingId,
            editMaxHeight,
            renamingId,
            draftFrom,
            changeLive,
            markGesture,
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
                {/* The keys come from the focusable nodes inside and bubble to here;
                    the group itself only takes the focus after Escape. */}
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                <div
                    data-testid="diagram-canvas"
                    role="group"
                    aria-label={t('canvas.surface.label')}
                    tabIndex={-1}
                    onKeyDown={onHostKeyDown}
                    onFocus={onHostFocus}
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
                        'relative h-full w-full outline-none',
                        shiftHeld && '[&_.react-flow__pane]:!cursor-crosshair',
                        className
                    )}
                >
                    <ChromeStyle />
                    {dependencyDrag ? <DropTargetStyle /> : null}
                    <div
                        role="status"
                        aria-live="polite"
                        data-testid="canvas-announcer"
                        className="sr-only"
                    >
                        {announcement}
                    </div>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onConnectStart={onConnectStart}
                        onConnectEnd={onConnectEnd}
                        isValidConnection={isUsableConnection}
                        onEdgeDoubleClick={(event, edge) =>
                            editable &&
                            edge.type === 'link' &&
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
                            if (!outsideIsQuiet()) setMenu(undefined);
                            cancelDraft();
                            setPopover(undefined);
                            setEditingId(undefined);
                        }}
                        onNodeDragStart={() => markGesture(true)}
                        onNodeDragStop={finishGesture}
                        {...interactionProps(prefs, {
                            editable,
                            shiftHeld: shiftHeld || snapOn,
                        })}
                        connectionMode={ConnectionMode.Loose}
                        onlyRenderVisibleElements={!fullRender && !diff}
                        onMoveStart={(event) => {
                            // a null event is a camera move made by code, not by the person
                            if (event) touched.current = true;
                        }}
                        onMove={(_, viewport) =>
                            storeApi.getState().setZoom(viewport.zoom)
                        }
                        ariaLabelConfig={ariaLabels}
                        proOptions={{ hideAttribution: true }}
                        className={isMacPlatform() ? 'mac' : undefined}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={16}
                            size={1.2}
                            color="hsl(var(--muted-foreground) / 0.35)"
                        />
                        {prefs.showMiniMap ? (
                            <MiniMap
                                pannable
                                zoomable
                                className="qb-minimap"
                                style={{
                                    background: MINIMAP_BACKGROUND,
                                    width: 100,
                                    height: 100,
                                }}
                                maskColor={MINIMAP_MASK}
                                maskStrokeColor={MINIMAP_WINDOW}
                                maskStrokeWidth={0}
                                nodeStrokeWidth={0}
                                nodeBorderRadius={5}
                                nodeColor={MINIMAP_NODE}
                                nodeStrokeColor={MINIMAP_NODE_STROKE}
                            />
                        ) : null}
                        <Panel position="bottom-right" className="qb-powered">
                            <PoweredByMark />
                        </Panel>
                    </ReactFlow>
                    <CornerTools
                        editable={editable}
                        snapOn={snapOn}
                        onSnap={() => setSnapOn((on) => !on)}
                        overlapping={overlapping.size > 0}
                        overlapHighlight={highlightOverlaps}
                        onOverlapHighlight={() => {
                            if (!highlightOverlaps) flashOverlaps();
                            setHighlightOverlaps(!highlightOverlaps);
                        }}
                        highlight={hooks?.highlight}
                    />
                    <TypeLegend />
                    {lost ? (
                        <button
                            type="button"
                            data-testid="show-all-pill"
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
                            ignoreOutside={outsideIsQuiet}
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
                                data-testid="show-all-hidden"
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
