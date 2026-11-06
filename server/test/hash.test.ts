import { describe, expect, it } from 'vitest';
import { diagramHash, stableStringify } from '../src/lib/hash.js';

describe('stableStringify', () => {
    it('ignores key order at every depth', () => {
        expect(stableStringify({ a: 1, b: { c: 2, d: [1, { y: 1, x: 2 }] } })).toBe(
            stableStringify({ b: { d: [1, { x: 2, y: 1 }], c: 2 }, a: 1 })
        );
    });

    it('keeps array order significant', () => {
        expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    });

    it('treats undefined properties as absent', () => {
        expect(stableStringify({ a: 1, b: undefined })).toBe(
            stableStringify({ a: 1 })
        );
    });

    it('handles primitives and null', () => {
        expect(stableStringify(null)).toBe('null');
        expect(stableStringify('x')).toBe('"x"');
        expect(stableStringify(3)).toBe('3');
    });
});

describe('diagramHash', () => {
    const content = { name: 'Shop', tables: [{ id: 't1', name: 'users' }] };

    it('is stable across key order', () => {
        expect(diagramHash('T', { tables: content.tables, name: 'Shop' })).toBe(
            diagramHash('T', content)
        );
    });

    it('changes when content or title changes', () => {
        const base = diagramHash('T', content);
        expect(diagramHash('T2', content)).not.toBe(base);
        expect(
            diagramHash('T', { ...content, tables: [{ id: 't1', name: 'x' }] })
        ).not.toBe(base);
    });

    it('ignores the top-level updatedAt only', () => {
        const base = diagramHash('T', { ...content, updatedAt: 'a' });
        expect(diagramHash('T', { ...content, updatedAt: 'b' })).toBe(base);
        const nested = diagramHash('T', {
            ...content,
            tables: [{ id: 't1', name: 'users', updatedAt: 'a' }],
        });
        const nested2 = diagramHash('T', {
            ...content,
            tables: [{ id: 't1', name: 'users', updatedAt: 'b' }],
        });
        expect(nested).not.toBe(nested2);
    });
});
