import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank, NOW } from '@/core/testing/helpers';
import { createEntityParts } from '@/core/model/defaults';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { startAutosave } from './autosave';
import { createEditorStore } from './editor-store';
import { selectVisibleEntities } from './selectors';

const addTable = (name: string) => ({
    type: 'entity.insert' as const,
    parts: createEntityParts(blank(), { name, now: NOW }),
});

describe('review core-store 17: autosave and selectors', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('saves after the maximum wait even when edits never pause', async () => {
        const adapter = new MemoryStorageAdapter();
        const save = vi.spyOn(adapter, 'save');
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({
            store,
            adapter,
            delayMs: 1000,
            maxWaitMs: 5000,
        });
        for (let i = 0; i < 12; i++) {
            store.getState().edit(addTable(`t${i}`));
            await vi.advanceTimersByTimeAsync(600);
        }
        expect(save).toHaveBeenCalled();
        autosave.dispose();
    });

    it('does not recreate a design removed while the editor held it dirty', async () => {
        const adapter = new MemoryStorageAdapter();
        const store = createEditorStore({ design: blank(), now: () => NOW });
        const autosave = startAutosave({ store, adapter, delayMs: 10 });
        const id = store.getState().design.id;
        store.getState().edit(addTable('a'));
        await adapter.remove(id);
        await autosave.flush();
        expect(await adapter.load(id)).toBeUndefined();
        expect(await adapter.list()).toEqual([]);
        autosave.dispose();
    });

    it('an update save arriving after a removal does not bring the design back, a create does', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = blank();
        await adapter.save(design);
        await adapter.remove(design.id);
        await adapter.save(design, { update: true });
        expect(await adapter.load(design.id)).toBeUndefined();
        await adapter.save(design);
        expect(await adapter.load(design.id)).toBeDefined();
    });

    it('selectVisibleEntities returns the same array until something changes', () => {
        const store = createEditorStore({ design: blank(), now: () => NOW });
        store.getState().edit(addTable('a'));
        const a = selectVisibleEntities(store.getState());
        expect(selectVisibleEntities(store.getState())).toBe(a);
        store.getState().edit(addTable('b'));
        const b = selectVisibleEntities(store.getState());
        expect(b).not.toBe(a);
        expect(b).toHaveLength(2);
    });
});
