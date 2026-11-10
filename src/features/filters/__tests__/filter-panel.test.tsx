import { selectFilter } from '@/store/selectors';
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { FilterPanel } from '../filter-panel';

describe('EDT-061 EDT-062 the panel opens ready to search', () => {
    it('has a focused search box and the two grouping buttons', () => {
        renderPanel(
            <FilterPanel onClose={() => undefined} />,
            withTables(['a'])
        );
        expect(document.activeElement).toBe(
            screen.getByLabelText('Search tables...')
        );
        expect(
            screen.getByRole('button', { name: 'Group by Schema' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Group by Area' })
        ).toBeTruthy();
    });

    it('closes with its X', async () => {
        const onClose = vi.fn();
        renderPanel(<FilterPanel onClose={onClose} />, withTables(['a']));
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalled();
    });
});

describe('EDT-063 EDT-064 EDT-072 the eyes', () => {
    it('hides one table, then shows it again which turns the filter off', async () => {
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            withTables(['a', 'b']),
            { filter: {} }
        );
        await userEvent.click(screen.getByRole('button', { name: 'Hide a' }));
        const id = store.getState().design.entities.order[0];
        expect(selectFilter(store.getState()).tableIds).toEqual([
            store.getState().design.entities.order[1],
        ]);
        expect(selectFilter(store.getState()).tableIds).not.toContain(id);
        await userEvent.click(screen.getByRole('button', { name: 'Show a' }));
        expect(selectFilter(store.getState())).toEqual({});
    });

    it('a group eye hides every table of the group', async () => {
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            withTables(['a', 'b']),
            { filter: {} }
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Hide public' })
        );
        expect(selectFilter(store.getState())).toEqual({ tableIds: [] });
    });

    it('the visibility choice is not an undo step (EDT-071)', async () => {
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            withTables(['a']),
            { filter: {} }
        );
        await userEvent.click(screen.getByRole('button', { name: 'Hide a' }));
        expect(store.getState().history.undo).toHaveLength(0);
    });
});

describe('EDT-065 a click on a table row', () => {
    it('shows it if hidden, selects it and asks the canvas to centre it', async () => {
        const design = withTables(['a', 'b']);
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            {
                filter: { tableIds: [design.entities.order[1]] },
            }
        );
        await userEvent.click(screen.getByRole('button', { name: 'a' }));
        expect(selectFilter(store.getState())).toEqual({});
        expect(store.getState().ui.selection).toEqual([
            design.entities.order[0],
        ]);
        expect(store.getState().ui.focus?.entityId).toBe(
            design.entities.order[0]
        );
    });
});

describe('EDT-066 EDT-067 EDT-068 searching', () => {
    it('narrows by name without changing what is hidden', async () => {
        const design = withTables(['users', 'orders']);
        const { store } = renderPanel(
            <FilterPanel onClose={() => undefined} />,
            design,
            {
                filter: { tableIds: [design.entities.order[0]] },
            }
        );
        await userEvent.type(screen.getByLabelText('Search tables...'), 'ORD');
        expect(screen.getAllByTestId('filter-table')).toHaveLength(1);
        expect(selectFilter(store.getState())).toEqual({
            tableIds: [design.entities.order[0]],
        });
    });

    it('offers Clear filter when nothing matches', async () => {
        renderPanel(
            <FilterPanel onClose={() => undefined} />,
            withTables(['users'])
        );
        await userEvent.type(screen.getByLabelText('Search tables...'), 'zzz');
        expect(screen.getByText('No tables found')).toBeTruthy();
        expect(
            screen.getByText('Try adjusting your search or filter')
        ).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear Filter' })
        );
        expect(screen.getAllByTestId('filter-table')).toHaveLength(1);
    });

    it('says Create a table to get started when the diagram is empty', () => {
        renderPanel(<FilterPanel onClose={() => undefined} />, withTables([]));
        expect(screen.getByText('No tables found')).toBeTruthy();
        expect(screen.getByText('Create a table to get started')).toBeTruthy();
    });
});
