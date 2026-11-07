import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { coalesceKey } from '@/core/commands/coalesce';
import type { Command, FailureReason } from '@/core/commands/command';
import {
    dispatch,
    emptyHistory,
    record,
    redo as redoHistory,
    undo as undoHistory,
} from '@/core/history/history';
import type { DispatchOptions } from '@/core/history/history';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { initialFilter } from '@/core/model/visibility-filter';
import type { VisibilityFilter } from '@/core/model/visibility-filter';
import type { WireWarning } from '@/core/wire/warning';
import { ZOOM_MAX, ZOOM_MIN } from './editor-state';
import type {
    DiagramLocation,
    EditorData,
    PanelSection,
    VisualsTab,
} from './editor-state';

export type EditResult =
    | { ok: true; changed: boolean }
    | { ok: false; reason: FailureReason | 'empty'; message: string };

export interface EditorActions {
    /** applies one command through the history; refused when read-only */
    edit(
        command: Command,
        options?: Pick<DispatchOptions, 'separate'>
    ): EditResult;
    /** applies a command that must not be undoable (bypasses history) */
    editWithoutHistory(command: Command): EditResult;
    undo(): EditResult;
    redo(): EditResult;
    /**
     * Swaps the whole design. With `history: 'reset'` (opening, switching) both
     * stacks are cleared and the design counts as saved; with `'keep'` the
     * stacks stay as they are; with `'step'` the swap is one undo step.
     */
    replaceDesign(
        design: Design,
        options?: { history?: 'reset' | 'keep' | 'step' }
    ): EditResult;
    /** adds a ready-made step: undoing applies `undo`, redoing applies `redo` */
    pushWholeDesignStep(undo: Design, redo: Design): void;
    clearRedo(): void;
    resetHistory(): void;
    setReadonly(readonly: boolean): void;
    markSaved(savedAt?: number): void;
    markDirty(): void;
    setLocation(location: DiagramLocation): void;
    setWarnings(warnings: WireWarning[]): void;
    // ui slice
    select(ids: Id[]): void;
    setFilter(filter: VisibilityFilter): void;
    setZoom(zoom: number): void;
    showPanel(section?: PanelSection, visualsTab?: VisualsTab): void;
    hidePanel(): void;
    /** shows the panel on Tables with that entity expanded (a lint finding, a canvas click) */
    showEntityInPanel(entityId: Id): void;
    /** forgets which table the panel asked to keep open, so asking again reopens it */
    clearExpandedEntity(): void;
    focusEntity(entityId: Id): void;
}

export type EditorState = EditorData & EditorActions;
export type EditorStore = StoreApi<EditorState>;

export interface EditorStoreOptions {
    design: Design;
    readonly?: boolean;
    location?: DiagramLocation;
    warnings?: WireWarning[];
    /** the filter loaded with the design; the default one is built from the design */
    filter?: VisibilityFilter;
    panelOpen?: boolean;
    /** the clock, for tests */
    now?: () => number;
}

const failed = (r: {
    reason: FailureReason | 'empty';
    message: string;
}): EditResult => ({
    ok: false,
    reason: r.reason,
    message: r.message,
});

/** One store per open editor: it holds the design and everything about viewing it. */
export function createEditorStore(options: EditorStoreOptions): EditorStore {
    const now = options.now ?? Date.now;
    return createStore<EditorState>()((set, get) => {
        const applyOptions = () => ({ readOnly: get().session.readonly });

        return {
            design: options.design,
            history: emptyHistory(),
            ui: {
                selection: [],
                panel: {
                    open: options.panelOpen ?? true,
                    section: 'tables',
                    visualsTab: 'areas',
                },
                filter:
                    options.filter ??
                    initialFilter(
                        options.design.entities.order.map(
                            (id) => options.design.entities.byId[id]
                        )
                    ),
                zoom: 1,
            },
            session: {
                readonly: options.readonly ?? false,
                dirty: false,
                warnings: options.warnings ?? [],
                location: options.location ?? { diagramId: options.design.id },
            },

            edit(command, edit) {
                const { design, history } = get();
                const result = dispatch(design, history, command, {
                    ...applyOptions(),
                    at: now(),
                    now: now(),
                    separate: edit?.separate,
                });
                if (!result.ok) return failed(result);
                if (result.changed)
                    set((s) => ({
                        design: result.design,
                        history: result.history,
                        session: { ...s.session, dirty: true },
                    }));
                return { ok: true, changed: result.changed };
            },

            editWithoutHistory(command) {
                const result = dispatch(get().design, get().history, command, {
                    ...applyOptions(),
                    now: now(),
                    skipHistory: true,
                });
                if (!result.ok) return failed(result);
                if (result.changed)
                    set((s) => ({
                        design: result.design,
                        session: { ...s.session, dirty: true },
                    }));
                return { ok: true, changed: result.changed };
            },

            undo() {
                const result = undoHistory(get().design, get().history, {
                    ...applyOptions(),
                    now: now(),
                });
                if (!result.ok) return failed(result);
                set((s) => ({
                    design: result.design,
                    history: result.history,
                    session: { ...s.session, dirty: true },
                }));
                return { ok: true, changed: true };
            },

            redo() {
                const result = redoHistory(get().design, get().history, {
                    ...applyOptions(),
                    now: now(),
                });
                if (!result.ok) return failed(result);
                set((s) => ({
                    design: result.design,
                    history: result.history,
                    session: { ...s.session, dirty: true },
                }));
                return { ok: true, changed: true };
            },

            replaceDesign(design, replace) {
                const mode = replace?.history ?? 'reset';
                if (mode === 'step')
                    return get().edit(
                        { type: 'design.replace', design },
                        { separate: true }
                    );
                if (mode === 'keep') {
                    if (get().session.readonly)
                        return {
                            ok: false,
                            reason: 'read-only',
                            message: 'This diagram cannot be edited',
                        };
                    set((s) => ({
                        design,
                        session: { ...s.session, dirty: true },
                    }));
                    return { ok: true, changed: true };
                }
                set((s) => ({
                    design,
                    history: emptyHistory(),
                    ui: { ...s.ui, selection: [] },
                    session: { ...s.session, dirty: false },
                }));
                return { ok: true, changed: true };
            },

            pushWholeDesignStep(undo, redo) {
                const command: Command = {
                    type: 'design.replace',
                    design: redo,
                };
                const inverse: Command = {
                    type: 'design.replace',
                    design: undo,
                };
                set((s) => ({
                    history: record(s.history, {
                        command,
                        inverse,
                        at: now(),
                        key: coalesceKey(command),
                        separate: true,
                    }),
                }));
            },

            clearRedo() {
                set((s) => ({ history: { ...s.history, redo: [] } }));
            },

            resetHistory() {
                set({ history: emptyHistory() });
            },

            setReadonly(readonly) {
                set((s) => ({ session: { ...s.session, readonly } }));
            },

            markSaved(savedAt) {
                set((s) => ({
                    session: {
                        ...s.session,
                        dirty: false,
                        savedAt: savedAt ?? now(),
                    },
                }));
            },

            markDirty() {
                set((s) => ({ session: { ...s.session, dirty: true } }));
            },

            setLocation(location) {
                set((s) => ({ session: { ...s.session, location } }));
            },

            setWarnings(warnings) {
                set((s) => ({ session: { ...s.session, warnings } }));
            },

            select(ids) {
                set((s) => ({ ui: { ...s.ui, selection: ids } }));
            },

            setFilter(filter) {
                set((s) => ({ ui: { ...s.ui, filter } }));
            },

            setZoom(zoom) {
                const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
                set((s) => ({ ui: { ...s.ui, zoom: clamped } }));
            },

            showPanel(section, visualsTab) {
                set((s) => ({
                    ui: {
                        ...s.ui,
                        panel: {
                            ...s.ui.panel,
                            open: true,
                            section: section ?? s.ui.panel.section,
                            visualsTab: visualsTab ?? s.ui.panel.visualsTab,
                        },
                    },
                }));
            },

            hidePanel() {
                set((s) => ({
                    ui: { ...s.ui, panel: { ...s.ui.panel, open: false } },
                }));
            },

            showEntityInPanel(entityId) {
                set((s) => ({
                    ui: {
                        ...s.ui,
                        panel: {
                            ...s.ui.panel,
                            open: true,
                            section: 'tables',
                            expandedEntityId: entityId,
                        },
                    },
                }));
            },

            clearExpandedEntity() {
                set((s) => ({
                    ui: {
                        ...s.ui,
                        panel: { ...s.ui.panel, expandedEntityId: undefined },
                    },
                }));
            },

            focusEntity(entityId) {
                set((s) => ({
                    ui: {
                        ...s.ui,
                        focus: {
                            entityId,
                            request: (s.ui.focus?.request ?? 0) + 1,
                        },
                    },
                }));
            },
        };
    });
}
