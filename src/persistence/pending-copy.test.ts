import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design } from '../core/model/design';
import { withTables } from '../core/testing/helpers';
import { openDexieStorage } from './dexie-adapter';
import { MemoryStorageAdapter } from './memory-adapter';
import { freshIndexedDb } from './test-support';
import {
    clearPendingCopy,
    readPendingCopy,
    restorePendingCopy,
    writePendingCopy,
} from './pending-copy';

const older = () => withTables(['a']);
/** the same design with one more table, changed five seconds later */
const newer = (base: Design): Design => ({
    ...withTables(['a', 'b']),
    id: base.id,
    updatedAt: base.updatedAt + 5000,
});

describe('CLI-141: the copy of the design kept as the page is left', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('keeps a design and reads it back, until it is cleared', () => {
        const design = older();
        expect(writePendingCopy(design)).toBe(true);
        const read = readPendingCopy(design.id);
        expect(read?.design.id).toBe(design.id);
        expect(read?.design.entities.order).toHaveLength(1);
        clearPendingCopy(design.id);
        expect(readPendingCopy(design.id)).toBeUndefined();
    });

    it('has nothing for a design that was not kept, and ignores a damaged copy', () => {
        expect(readPendingCopy('nope')).toBeUndefined();
        localStorage.setItem('qbase:pending-copy:x', '{not json');
        expect(readPendingCopy('x')).toBeUndefined();
        localStorage.setItem(
            'qbase:pending-copy:y',
            JSON.stringify({ doc: 5 })
        );
        expect(readPendingCopy('y')).toBeUndefined();
    });

    it('says so when the browser refuses the write (a design over the quota)', () => {
        const refuse = vi
            .spyOn(localStorage, 'setItem')
            .mockImplementation(() => {
                throw new DOMException('full', 'QuotaExceededError');
            });
        try {
            expect(writePendingCopy(older())).toBe(false);
        } finally {
            // put back by hand: the storage object does not take part in restoreAllMocks
            refuse.mockRestore();
        }
        expect(writePendingCopy(older())).toBe(true);
    });

    describe('opening a design', () => {
        it('uses a newer copy, writes it to the store, and drops the copy', async () => {
            const base = older();
            const adapter = new MemoryStorageAdapter();
            await adapter.save(base);
            const kept = newer(base);
            writePendingCopy(kept);

            const stored = (await adapter.load(base.id))!;
            const opened = await restorePendingCopy(adapter, base.id, stored);
            expect(opened.design.entities.order).toHaveLength(2);
            // the real store now has the edit, and the copy is gone
            expect(
                (await adapter.load(base.id))!.design.entities.order
            ).toHaveLength(2);
            expect(readPendingCopy(base.id)).toBeUndefined();
        });

        it('drops a copy that is not newer: the write had finished', async () => {
            const base = older();
            const adapter = new MemoryStorageAdapter();
            await adapter.save(base);
            writePendingCopy(base);
            const stored = (await adapter.load(base.id))!;
            const opened = await restorePendingCopy(adapter, base.id, stored);
            expect(opened).toBe(stored);
            expect(readPendingCopy(base.id)).toBeUndefined();
        });

        it('leaves a design alone when there is no copy', async () => {
            const base = older();
            const adapter = new MemoryStorageAdapter();
            await adapter.save(base);
            const stored = (await adapter.load(base.id))!;
            expect(await restorePendingCopy(adapter, base.id, stored)).toBe(
                stored
            );
        });

        it('keeps the copy, and still opens it, when the store refuses the write', async () => {
            const base = older();
            const adapter = new MemoryStorageAdapter();
            await adapter.save(base);
            writePendingCopy(newer(base));
            const stored = (await adapter.load(base.id))!;
            vi.spyOn(adapter, 'save').mockRejectedValue(new Error('disk full'));
            const opened = await restorePendingCopy(adapter, base.id, stored);
            expect(opened.design.entities.order).toHaveLength(2);
            expect(readPendingCopy(base.id)).toBeDefined();
        });

        it('shows a newer copy without writing or dropping it when there is no store to write to (read-only)', async () => {
            const base = older();
            const adapter = new MemoryStorageAdapter();
            await adapter.save(base);
            writePendingCopy(newer(base));
            const stored = (await adapter.load(base.id))!;
            const opened = await restorePendingCopy(undefined, base.id, stored);
            expect(opened.design.entities.order).toHaveLength(2);
            expect(
                (await adapter.load(base.id))!.design.entities.order
            ).toHaveLength(1);
            expect(readPendingCopy(base.id)).toBeDefined();
        });
    });

    it('goes when the design is deleted', async () => {
        const { adapter } = await openDexieStorage({ ...freshIndexedDb() });
        const base = older();
        await adapter.save(base);
        writePendingCopy(newer(base));
        await adapter.remove(base.id);
        expect(readPendingCopy(base.id)).toBeUndefined();
    });

    it('is keyed by design: another design is not touched', () => {
        const a = older();
        const b = { ...older(), id: 'other-design' };
        writePendingCopy(a);
        expect(readPendingCopy(b.id)).toBeUndefined();
    });
});
