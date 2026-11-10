import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { parse } from '@/core/wire/parse';
import { serialise } from '@/core/wire/serialise';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { startAutosave } from './autosave';
import { createEditorStore } from './editor-store';
import { selectFilter } from './selectors';

describe('the table filter is saved with the diagram', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows everything when nothing was saved', () => {
        const store = createEditorStore({ design: withTables(['a', 'b']) });
        expect(selectFilter(store.getState())).toEqual({});
        // one shared object, so a subscriber is not woken for nothing
        expect(selectFilter(store.getState())).toBe(
            selectFilter(store.getState())
        );
    });

    it('setFilter puts the filter in the design and marks it unsaved', () => {
        const store = createEditorStore({ design: withTables(['a', 'b']) });
        const id = store.getState().design.entities.order[0];
        store.getState().setFilter({ tableIds: [id] });
        expect(store.getState().design.filter).toEqual({ tableIds: [id] });
        expect(store.getState().session.dirty).toBe(true);
    });

    it('showing everything again removes the filter from the design', () => {
        const store = createEditorStore({ design: withTables(['a', 'b']) });
        store.getState().setFilter({ tableIds: [] });
        store.getState().setFilter({});
        expect(store.getState().design.filter).toBeUndefined();
        expect('filter' in serialise(store.getState().design)).toBe(false);
    });

    it('a viewer can change the filter on screen but it is not marked unsaved', () => {
        const store = createEditorStore({
            design: withTables(['a']),
            readonly: true,
        });
        store.getState().setFilter({ tableIds: [] });
        expect(selectFilter(store.getState())).toEqual({ tableIds: [] });
        expect(store.getState().session.dirty).toBe(false);
    });

    it('a filter change alone is autosaved and survives a reload', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a', 'b', 'c']);
        await adapter.save(design);
        const store = createEditorStore({ design, now: () => NOW });
        const autosave = startAutosave({ store, adapter, delayMs: 10 });
        const [a, , c] = design.entities.order;
        // the person unhides a and c
        store.getState().setFilter({ tableIds: [a, c] });
        await vi.advanceTimersByTimeAsync(50);
        autosave.dispose();

        const loaded = await adapter.load(design.id);
        const reopened = createEditorStore({ design: loaded!.design });
        expect(selectFilter(reopened.getState())).toEqual({
            tableIds: [a, c],
        });
    });

    it('round trips through the saved JSON', () => {
        const design = withTables(['a', 'b']);
        const store = createEditorStore({ design });
        const id = design.entities.order[1];
        store.getState().setFilter({ tableIds: [id] });
        const again = parse(serialise(store.getState().design)).design;
        expect(again.filter).toEqual({ tableIds: [id] });
    });

    it('opening another diagram does not carry the filter over', () => {
        const store = createEditorStore({ design: withTables(['a']) });
        store.getState().setFilter({ tableIds: [] });
        store.getState().replaceDesign(blank(), { history: 'reset' });
        expect(selectFilter(store.getState())).toEqual({});
    });

    it('an older filter kept apart from the design is used only when the design has none', () => {
        const old = { tableIds: ['x'] };
        const bare = createEditorStore({
            design: withTables(['a']),
            filter: old,
        });
        expect(selectFilter(bare.getState())).toEqual(old);

        const design = { ...withTables(['a']), filter: { schemaIds: ['s'] } };
        const own = createEditorStore({ design, filter: old });
        expect(selectFilter(own.getState())).toEqual({ schemaIds: ['s'] });
    });
});
