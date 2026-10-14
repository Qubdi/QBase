import { describe, expect, it } from 'vitest';
import { planCarryForward, targetExists } from '../src/comments/targets.js';

const content = {
    tables: [
        { id: 't1', fields: [{ id: 'f1' }, { id: 'f2' }] },
        { id: 't2', fields: [{ id: 'f3' }] },
        { id: 't3' },
    ],
    relationships: [{ id: 'r1' }],
};

describe('targetExists', () => {
    it('finds tables, fields and relationships by id', () => {
        expect(targetExists(content, 'table', 't2')).toBe(true);
        expect(targetExists(content, 'field', 'f3')).toBe(true);
        expect(targetExists(content, 'relationship', 'r1')).toBe(true);
    });

    it('does not confuse target types', () => {
        expect(targetExists(content, 'table', 'f1')).toBe(false);
        expect(targetExists(content, 'field', 't1')).toBe(false);
        expect(targetExists(content, 'relationship', 't1')).toBe(false);
    });

    it('is false for unknown ids', () => {
        expect(targetExists(content, 'table', 'nope')).toBe(false);
        expect(targetExists(content, 'field', 'nope')).toBe(false);
        expect(targetExists(content, 'relationship', 'nope')).toBe(false);
    });

    it('survives malformed content', () => {
        for (const bad of [null, undefined, 1, 'x', [], {}, { tables: 'x' }, { tables: [null, 1, { fields: 'x' }] }, { relationships: [null] }]) {
            for (const type of ['table', 'field', 'relationship'] as const) {
                expect(targetExists(bad, type, 'x')).toBe(false);
            }
        }
    });
});

describe('planCarryForward', () => {
    const list = [
        { id: 'c1', targetType: 'table' as const, targetId: 't1' },
        { id: 'c2', targetType: 'field' as const, targetId: 'gone' },
        { id: 'c3', targetType: 'relationship' as const, targetId: 'r1' },
    ];

    it('carries comments whose target still exists and orphans the rest', () => {
        expect(planCarryForward(list, content)).toEqual({
            carried: ['c1', 'c3'],
            orphaned: ['c2'],
        });
    });

    it('orphans everything when the content is empty', () => {
        expect(planCarryForward(list, {})).toEqual({
            carried: [],
            orphaned: ['c1', 'c2', 'c3'],
        });
    });

    it('handles no comments', () => {
        expect(planCarryForward([], content)).toEqual({
            carried: [],
            orphaned: [],
        });
    });
});
