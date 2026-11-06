import React from 'react';
import { act, render } from '@testing-library/react';
import { ReactFlowProvider, useReactFlow, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
    sameIds,
    selectSelectedTableIds,
    useSelectedTableIds,
} from '../use-selected-table-ids';

const node = (id: string, over: Partial<Node> = {}): Node => ({
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: {},
    ...over,
});

describe('selectSelectedTableIds', () => {
    it('picks the selected, visible tables only', () => {
        const ids = selectSelectedTableIds({
            nodes: [
                node('a', { selected: true }),
                node('b'),
                node('c', { selected: true, hidden: true }),
                node('note', { type: 'note', selected: true }),
                node('area', { type: 'area', selected: true }),
                node('d', { selected: true }),
            ],
        });
        expect(ids).toEqual(['a', 'd']);
    });

    it('is empty when nothing is selected', () => {
        expect(selectSelectedTableIds({ nodes: [node('a')] })).toEqual([]);
        expect(selectSelectedTableIds({ nodes: [] })).toEqual([]);
    });
});

describe('sameIds', () => {
    it('compares by content, in order', () => {
        expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(sameIds([], [])).toBe(true);
        expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
        expect(sameIds(['a'], ['a', 'b'])).toBe(false);
        expect(sameIds(['a', 'b'], ['a'])).toBe(false);
        expect(sameIds(['a'], ['c'])).toBe(false);
    });

    it('treats the very same list as equal', () => {
        const list = ['a'];
        expect(sameIds(list, list)).toBe(true);
    });
});

describe('useSelectedTableIds', () => {
    // A stand-in for one table's context menu: there is one of these per table,
    // so how often it re-renders decides how smooth dragging a table is.
    const setup = () => {
        const renders = { count: 0 };
        let flow!: ReturnType<typeof useReactFlow>;
        const Menu: React.FC = () => {
            renders.count++;
            const ids = useSelectedTableIds();
            return <div data-testid="ids">{ids.join(',')}</div>;
        };
        const Grab: React.FC = () => {
            flow = useReactFlow();
            return null;
        };
        const view = render(
            <ReactFlowProvider
                defaultNodes={[
                    node('a', { selected: true }),
                    node('b'),
                    node('c'),
                ]}
            >
                <Grab />
                <Menu />
            </ReactFlowProvider>
        );
        return { renders, view, flow: () => flow };
    };

    it('reports the selection', () => {
        const { view } = setup();
        expect(view.getByTestId('ids').textContent).toBe('a');
    });

    it('re-renders when the selection changes', () => {
        const { view, flow, renders } = setup();
        const before = renders.count;
        act(() =>
            flow().setNodes((nodes) =>
                nodes.map((n) => ({ ...n, selected: n.id !== 'a' }))
            )
        );
        expect(view.getByTestId('ids').textContent).toBe('b,c');
        expect(renders.count).toBeGreaterThan(before);
    });

    it('does not re-render while tables are only being moved', () => {
        const { flow, renders } = setup();
        const before = renders.count;
        for (let i = 1; i <= 30; i++) {
            act(() =>
                flow().setNodes((nodes) =>
                    nodes.map((n) => ({
                        ...n,
                        position: { x: i * 3, y: i * 2 },
                    }))
                )
            );
        }
        // thirty drag steps, same selection: no re-render of the menu
        expect(renders.count).toBe(before);
    });

    it('does not re-render when another table is moved by a drag', () => {
        const { flow, renders } = setup();
        const before = renders.count;
        act(() =>
            flow().setNodes((nodes) =>
                nodes.map((n) =>
                    n.id === 'c' ? { ...n, position: { x: 99, y: 99 } } : n
                )
            )
        );
        expect(renders.count).toBe(before);
    });
});
