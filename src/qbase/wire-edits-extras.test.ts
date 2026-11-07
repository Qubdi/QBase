import { describe, expect, it } from 'vitest';
import { columnPatchFromWire, keyFromIndex } from './wire-edits';

describe('saved-diagram edits carry descending columns, predicates, domains and computed columns', () => {
    it('an index with descendingFieldIds and where becomes a key with them', () => {
        const key = keyFromIndex({
            id: 'i1',
            name: 'idx',
            fieldIds: ['a', 'b'],
            unique: false,
            descendingFieldIds: ['a'],
            where: 'b IS NULL',
            createdAt: 1,
        });
        expect(key.descending).toEqual(['a']);
        expect(key.where).toBe('b IS NULL');
    });

    it('an old index (no new keys) becomes the same key as before', () => {
        const key = keyFromIndex({
            id: 'i1',
            name: 'idx',
            fieldIds: ['a'],
            unique: true,
            createdAt: 1,
        });
        expect(key).toEqual({
            id: 'i1',
            label: 'idx',
            members: ['a'],
            distinct: true,
            madeAt: 1,
        });
    });

    it('a field patch sets and clears domain and generated', () => {
        expect(
            columnPatchFromWire({
                domain: 'email',
                generatedExpression: 'a + 1',
                generatedStored: false,
            })
        ).toEqual({
            domain: 'email',
            generated: { expression: 'a + 1', stored: false },
        });
        expect(
            columnPatchFromWire({ domain: null, generatedExpression: null })
        ).toEqual({ domain: undefined, generated: undefined });
        expect(columnPatchFromWire({ name: 'x' })).toEqual({ name: 'x' });
    });
});
