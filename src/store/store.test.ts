import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { createEntityParts } from '@/core/model/defaults';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { startAutosave } from './autosave';
import { createEditorStore } from './editor-store';
import {
    selectCanRedo,
    selectCanUndo,
    selectDirty,
    selectLocked,
    selectVisibleEntities,
} from './selectors';

const addTable = (name: string) => ({
    type: 'entity.insert' as const,
    parts: createEntityParts(blank(), { name, now: NOW }),
});

describe('editor store: commands and history (EDT-219, EDT-220)', () => {
    it('applies a command, marks the session dirty and records an undo step', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        expect(selectDirty(store.getState())).toBe(false);
        expect(store.getState().edit(addTable('a')).ok).toBe(true);
        expect(store.getState().design.entities.order).toHaveLength(1);
        expect(selectDirty(store.getState())).toBe(true);
        expect(selectCanUndo(store.getState())).toBe(true);
    });

    it('undoes and redoes, and a new edit clears the redo stack', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        store.getState().edit(addTable('a'));
        store.getState().undo();
        expect(store.getState().design.entities.order).toHaveLength(0);
        expect(selectCanRedo(store.getState())).toBe(true);
        store.getState().redo();
        expect(store.getState().design.entities.order).toHaveLength(1);
        store.getState().undo();
        store.getState().edit(addTable('b'));
        expect(selectCanRedo(store.getState())).toBe(false);
    });

    it('reports nothing to undo instead of throwing', () => {
        const store = createEditorStore({ design: blank() });
        expect(store.getState().undo()).toMatchObject({
            ok: false,
            reason: 'empty',
        });
    });

    it('skips history for edits that must not be undoable (EDT-225)', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        store.getState().editWithoutHistory(addTable('a'));
        expect(selectCanUndo(store.getState())).toBe(false);
    });
});

describe('editor store: read-only (EDT-014)', () => {
    it('refuses every command and leaves design and history alone', () => {
        const design = blank();
        const store = createEditorStore({ design, readonly: true });
        const result = store.getState().edit(addTable('a'));
        expect(result).toMatchObject({ ok: false, reason: 'read-only' });
        expect(store.getState().design).toBe(design);
        expect(selectDirty(store.getState())).toBe(false);
        expect(selectLocked(store.getState())).toBe(true);
    });

    it('can be switched on and off; Oracle designs are edited like any other', () => {
        const store = createEditorStore({ design: blank() });
        store.getState().setReadonly(true);
        expect(store.getState().edit(addTable('a')).ok).toBe(false);
        store.getState().setReadonly(false);
        expect(store.getState().edit(addTable('a')).ok).toBe(true);
        const oracle = createEditorStore({ design: blank('oracle') });
        expect(selectLocked(oracle.getState())).toBe(false);
        expect(oracle.getState().edit(addTable('a')).ok).toBe(true);
    });

    it('still lets the person select, filter, zoom and focus', () => {
        const store = createEditorStore({
            design: withTables(['a']),
            readonly: true,
        });
        const id = store.getState().design.entities.order[0];
        store.getState().select([id]);
        store.getState().setZoom(2);
        store.getState().focusEntity(id);
        expect(store.getState().ui.selection).toEqual([id]);
        expect(store.getState().ui.zoom).toBe(2);
        expect(store.getState().ui.focus?.entityId).toBe(id);
    });
});

describe('editor store: whole-design replace', () => {
    it('is one undo step that restores the previous design', () => {
        const before = withTables(['a']);
        const after = withTables(['a', 'b', 'c']);
        const store = createEditorStore({ design: before, now: () => NOW });
        store.getState().replaceDesign(after, { history: 'step' });
        expect(store.getState().history.undo).toHaveLength(1);
        store.getState().undo();
        expect(store.getState().design.entities.order).toEqual(
            before.entities.order
        );
        store.getState().redo();
        expect(store.getState().design.entities.order).toEqual(
            after.entities.order
        );
    });

    it('opening another design clears the history and counts as saved', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        store.getState().edit(addTable('a'));
        store.getState().replaceDesign(withTables(['x']));
        expect(selectCanUndo(store.getState())).toBe(false);
        expect(selectDirty(store.getState())).toBe(false);
    });

    it('a pushed step undoes to the old design and redoes to the new one', () => {
        const before = withTables(['a']);
        const after = withTables(['b']);
        const store = createEditorStore({ design: before, now: () => NOW });
        store.getState().replaceDesign(after, { history: 'keep' });
        store.getState().pushWholeDesignStep(before, after);
        expect(store.getState().history.undo).toHaveLength(1);
        store.getState().undo();
        expect(store.getState().design.entities.order).toEqual(
            before.entities.order
        );
    });
});

describe('editor store: view state', () => {
    it('keeps the zoom between 10% and 500% (EDT-019)', () => {
        const store = createEditorStore({ design: blank() });
        store.getState().setZoom(0.01);
        expect(store.getState().ui.zoom).toBe(0.1);
        store.getState().setZoom(50);
        expect(store.getState().ui.zoom).toBe(5);
    });

    it('opens the panel on Tables with the entity expanded (A7)', () => {
        const store = createEditorStore({ design: blank(), panelOpen: false });
        store.getState().showEntityInPanel('t1');
        expect(store.getState().ui.panel).toMatchObject({
            open: true,
            section: 'tables',
            expandedEntityId: 't1',
        });
    });

    it('forgets the expanded table so asking again reopens it (EDT-107)', () => {
        const store = createEditorStore({ design: blank() });
        store.getState().showEntityInPanel('t1');
        store.getState().clearExpandedEntity();
        expect(store.getState().ui.panel.expandedEntityId).toBeUndefined();
    });

    it('asking to focus the same entity twice is two requests', () => {
        const store = createEditorStore({ design: blank() });
        store.getState().focusEntity('t1');
        const first = store.getState().ui.focus?.request;
        store.getState().focusEntity('t1');
        expect(store.getState().ui.focus?.request).toBe((first ?? 0) + 1);
    });

    it('hides entities the filter does not show (EDT-070)', () => {
        const store = createEditorStore({
            design: withTables(['a', 'b']),
            filter: { tableIds: [] },
        });
        expect(selectVisibleEntities(store.getState())).toHaveLength(0);
        const id = store.getState().design.entities.order[0];
        store.getState().setFilter({ tableIds: [id] });
        expect(selectVisibleEntities(store.getState())).toHaveLength(1);
    });

    it('changing the view does not make the design dirty (EDT-225)', () => {
        const store = createEditorStore({ design: blank() });
        store.getState().setZoom(2);
        store.getState().setFilter({});
        expect(selectDirty(store.getState())).toBe(false);
    });
});

describe('autosave', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits for a quiet moment, then saves once and clears the dirty flag', async () => {
        const adapter = new MemoryStorageAdapter();
        const save = vi.spyOn(adapter, 'save');
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({ store, adapter, delayMs: 500 });
        store.getState().edit(addTable('a'));
        store.getState().edit(addTable('b'));
        await vi.advanceTimersByTimeAsync(499);
        expect(save).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2);
        expect(save).toHaveBeenCalledTimes(1);
        expect(selectDirty(store.getState())).toBe(false);
        const loaded = await adapter.load(store.getState().design.id);
        expect(loaded?.design.entities.order).toHaveLength(2);
        autosave.dispose();
    });

    it('keeps the dirty flag and reports when the write fails', async () => {
        const adapter = new MemoryStorageAdapter();
        vi.spyOn(adapter, 'save').mockRejectedValue(new Error('disk full'));
        const onError = vi.fn();
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({
            store,
            adapter,
            delayMs: 10,
            onError,
        });
        store.getState().edit(addTable('a'));
        await vi.advanceTimersByTimeAsync(20);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(selectDirty(store.getState())).toBe(true);
        autosave.dispose();
    });

    it('never writes while read-only (C2)', async () => {
        const adapter = new MemoryStorageAdapter();
        const save = vi.spyOn(adapter, 'save');
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({ store, adapter, delayMs: 10 });
        store.getState().edit(addTable('a'));
        store.getState().setReadonly(true);
        await autosave.flush();
        await vi.advanceTimersByTimeAsync(50);
        expect(save).not.toHaveBeenCalled();
        autosave.dispose();
    });

    it('flush saves at once', async () => {
        const adapter = new MemoryStorageAdapter();
        const save = vi.spyOn(adapter, 'save');
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({ store, adapter, delayMs: 10_000 });
        store.getState().edit(addTable('a'));
        await autosave.flush();
        expect(save).toHaveBeenCalledTimes(1);
        autosave.dispose();
    });
});

describe('review ui 9: replaceDesign honours the locks in every mode', () => {
    it.each(['reset', 'keep', 'step'] as const)(
        'a read-only session refuses mode %s and keeps the design',
        (history) => {
            const before = withTables(['a']);
            const store = createEditorStore({
                design: before,
                readonly: true,
                now: () => NOW,
            });
            const result = store
                .getState()
                .replaceDesign(withTables(['b']), { history });
            expect(result.ok).toBe(false);
            expect(store.getState().design).toBe(before);
        }
    );
});

describe('editor store: highlighted custom type (EDT-196)', () => {
    it('holds one type at a time, is not undoable and is not saved', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const before = store.getState().design;
        store.getState().setHighlightedType('a');
        store.getState().setHighlightedType('b');
        expect(store.getState().ui.highlightedTypeId).toBe('b');
        expect(store.getState().design).toBe(before);
        expect(selectCanUndo(store.getState())).toBe(false);
        expect(selectDirty(store.getState())).toBe(false);
        store.getState().setHighlightedType(undefined);
        expect(store.getState().ui.highlightedTypeId).toBeUndefined();
    });

    it('is forgotten when another design is opened', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        store.getState().setHighlightedType('a');
        store.getState().replaceDesign(blank());
        expect(store.getState().ui.highlightedTypeId).toBeUndefined();
    });
});

describe('editor store: dependencies (EDT-185, EDT-186)', () => {
    it('adds, deletes and undoes a dependency, and a deleted view takes it along in one step', () => {
        const store = createEditorStore({
            design: withTables(['users', 'v']),
            now: () => NOW,
        });
        const [table, view] = store.getState().design.entities.order;
        store.getState().edit({
            type: 'entity.update',
            id: view,
            patch: { kind: 'view' },
        });
        const dep = {
            id: 'dep1',
            tableId: table,
            dependentTableId: view,
            createdAt: NOW,
        };
        store.getState().edit({ type: 'dependency.insert', item: dep });
        expect(store.getState().design.dependencies).toEqual([dep]);
        store.getState().edit({ type: 'entity.remove', id: view });
        expect(store.getState().design.dependencies).toEqual([]);
        store.getState().undo();
        expect(store.getState().design.dependencies).toEqual([dep]);
        store.getState().edit({ type: 'dependency.remove', id: 'dep1' });
        expect(store.getState().design.dependencies).toEqual([]);
        store.getState().undo();
        expect(store.getState().design.dependencies).toEqual([dep]);
    });
});
