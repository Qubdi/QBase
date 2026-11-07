import { describe, expect, it } from 'vitest';
import { NOW, withTables } from '@/core/testing/helpers';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { matchesSearch } from '../design-search';
import {
    createBlankDesign,
    duplicateDesign,
    removeStoredDesign,
    renameStoredDesign,
    storeNewDesign,
} from '../design-service';

describe('designs: create, rename, duplicate, delete in local storage (SHL-038 to SHL-049)', () => {
    it('creates a blank design and makes it the default', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = await createBlankDesign(adapter, {
            databaseType: 'mysql',
            defaultName: 'Diagram 1',
            name: '  ',
        });
        expect(design.name).toBe('Diagram 1');
        expect((await adapter.list()).map((d) => d.id)).toEqual([design.id]);
        expect((await adapter.readSettings()).defaultDiagramId).toBe(design.id);
    });

    it('stores an imported design as the new default', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await storeNewDesign(adapter, design);
        expect(
            (await adapter.load(design.id))?.design.entities.order
        ).toHaveLength(1);
        expect((await adapter.readSettings()).defaultDiagramId).toBe(design.id);
    });

    it('renames, ignoring a blank name', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        expect(await renameStoredDesign(adapter, design.id, '   ')).toBe(false);
        expect(
            await renameStoredDesign(adapter, design.id, 'Shop', NOW + 5)
        ).toBe(true);
        const loaded = (await adapter.load(design.id))?.design;
        expect(loaded?.name).toBe('Shop');
        expect(loaded?.updatedAt).toBe(NOW + 5);
    });

    it('duplicates with fresh ids and a copy name, leaving the original', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a', 'b']);
        await adapter.save(design);
        const copy = await duplicateDesign(
            adapter,
            design.id,
            '(Copy)',
            NOW + 9
        );
        expect(copy?.name).toBe('Test (Copy)');
        expect(copy?.id).not.toBe(design.id);
        expect(
            copy?.entities.order.some((id) =>
                design.entities.order.includes(id)
            )
        ).toBe(false);
        expect(copy?.entities.order).toHaveLength(2);
        expect((await adapter.list()).length).toBe(2);
        expect(
            await duplicateDesign(adapter, 'missing', '(Copy)')
        ).toBeUndefined();
    });

    it('deletes, clears a default that pointed at it and says how many remain', async () => {
        const adapter = new MemoryStorageAdapter();
        const a = await createBlankDesign(adapter, {
            databaseType: 'sqlite',
            defaultName: 'A',
        });
        const b = await createBlankDesign(adapter, {
            databaseType: 'sqlite',
            defaultName: 'B',
        });
        expect(await removeStoredDesign(adapter, b.id)).toBe(1);
        expect((await adapter.readSettings()).defaultDiagramId).toBe('');
        expect(await removeStoredDesign(adapter, a.id)).toBe(0);
    });

    it('searches by name without regard to case', () => {
        expect(matchesSearch({ name: 'Billing Shop' }, ' shop ')).toBe(true);
        expect(matchesSearch({ name: 'Billing' }, 'zzz')).toBe(false);
        expect(matchesSearch({ name: 'Billing' }, '')).toBe(true);
    });
});
