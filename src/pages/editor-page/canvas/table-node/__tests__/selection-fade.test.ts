import { describe, expect, it } from 'vitest';
import { isUnrelatedToSelection } from '../selection-fade';

const table = (id: string, selected = false) => ({
    id,
    type: 'table',
    selected,
});
const edge = (source: string, target: string) => ({ source, target });

describe('isUnrelatedToSelection', () => {
    it('fades nothing while no table is selected', () => {
        const nodes = [table('a'), table('b')];
        const edges = [edge('a', 'b')];
        expect(isUnrelatedToSelection(nodes, edges, 'a')).toBe(false);
        expect(isUnrelatedToSelection(nodes, edges, 'b')).toBe(false);
    });

    it('keeps the selected table and its links in focus, in both directions', () => {
        const nodes = [
            table('a'),
            table('b', true),
            table('c'),
            table('d'),
            table('e'),
        ];
        const edges = [edge('a', 'b'), edge('b', 'c'), edge('d', 'e')];
        expect(isUnrelatedToSelection(nodes, edges, 'b')).toBe(false);
        expect(isUnrelatedToSelection(nodes, edges, 'a')).toBe(false);
        expect(isUnrelatedToSelection(nodes, edges, 'c')).toBe(false);
        expect(isUnrelatedToSelection(nodes, edges, 'd')).toBe(true);
        expect(isUnrelatedToSelection(nodes, edges, 'e')).toBe(true);
    });

    it('does not count a link between two tables that are both unselected', () => {
        const nodes = [table('a', true), table('b'), table('c')];
        expect(isUnrelatedToSelection(nodes, [edge('b', 'c')], 'b')).toBe(true);
    });

    it('only counts selected tables, not other selected nodes', () => {
        const nodes = [
            table('a'),
            { id: 'note', type: 'note', selected: true },
        ];
        expect(isUnrelatedToSelection(nodes, [], 'a')).toBe(false);
    });

    it('follows a change of selection, and reuses the work while nothing changed', () => {
        const edges = [edge('a', 'b')];
        const first = [table('a', true), table('b'), table('c')];
        expect(isUnrelatedToSelection(first, edges, 'c')).toBe(true);
        // a new node list: the answer follows it
        const second = [table('a'), table('b'), table('c', true)];
        expect(isUnrelatedToSelection(second, edges, 'a')).toBe(true);
        expect(isUnrelatedToSelection(second, edges, 'c')).toBe(false);
    });
});
