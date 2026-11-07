import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { exportFileText } from '@/core/wire/file-export';
import { ImportError, importFileText } from '@/core/wire/file-import';
import { sampleS2 } from '@/dialects/testing/sample-designs';

describe('IMP-073 IMP-074 diagram file import', () => {
    const source = sampleS2('postgresql');
    const text = exportFileText(source);
    const { design } = importFileText(text, { now: 5_000 });

    it('replaces every id, consistently', () => {
        const oldIds = new Set([
            source.id,
            ...source.entities.order,
            ...Object.keys(source.columns),
            ...Object.keys(source.keys),
            ...source.links.order,
        ]);
        const newIds = [
            design.id,
            ...design.entities.order,
            ...Object.keys(design.columns),
            ...Object.keys(design.keys),
            ...design.links.order,
        ];
        expect(newIds.some((id) => oldIds.has(id))).toBe(false);
        expect(new Set(newIds).size).toBe(newIds.length);
        for (const e of listOf(design.entities))
            for (const cid of e.columnIds)
                expect(design.columns[cid]).toBeTruthy();
        const link = listOf(design.links)[0];
        expect(design.entities.byId[link.sourceEntityId].columnIds).toContain(
            link.sourceColumnId
        );
        expect(design.entities.byId[link.targetEntityId].columnIds).toContain(
            link.targetColumnId
        );
    });
    it('keeps the content and sets the dates to now', () => {
        expect(design.name).toBe(source.name);
        expect(listOf(design.entities).map((e) => e.name)).toEqual(
            listOf(source.entities).map((e) => e.name)
        );
        expect(design.createdAt).toBe(5_000);
        expect(design.updatedAt).toBe(5_000);
    });
    it('a bad file is refused with one error and builds nothing', () => {
        expect(() => importFileText('not json')).toThrow(ImportError);
        expect(() => importFileText('{"a":1}')).toThrow(ImportError);
        expect(() => importFileText('[]')).toThrow(ImportError);
    });
});
