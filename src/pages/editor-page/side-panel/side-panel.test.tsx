import React from 'react';
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { SidePanel } from './side-panel';

describe('EDT-002 EDT-003 EDT-187 the panel shows the section the store names', () => {
    it('starts on Tables', () => {
        renderPanel(<SidePanel />, withTables(['a']));
        expect(screen.getAllByTestId('table-row')).toHaveLength(1);
    });

    it('switches to Refs and Visuals', () => {
        const { store } = renderPanel(<SidePanel />, withTables(['a']));
        act(() => store.getState().showPanel('refs'));
        expect(screen.getByText('No relationships')).toBeTruthy();
        act(() => store.getState().showPanel('visuals'));
        expect(screen.getByText('No areas')).toBeTruthy();
    });

    it('shows Custom Types only on a database that has them', () => {
        const pg = renderPanel(<SidePanel />, withTables(['a'], 'postgresql'));
        act(() => pg.store.getState().showPanel('customTypes'));
        expect(screen.getByText('No custom types')).toBeTruthy();
        pg.unmount();
        const my = renderPanel(<SidePanel />, withTables(['a'], 'mysql'));
        act(() => my.store.getState().showPanel('customTypes'));
        expect(screen.queryByText('No custom types')).toBeNull();
    });

    it('loads the DBML section on demand (EDT-238)', async () => {
        const { store } = renderPanel(<SidePanel />, withTables(['a']));
        act(() => store.getState().showPanel('dbml'));
        expect(
            await screen.findByText(/Table "a"|a/, {}, { timeout: 4000 })
        ).toBeTruthy();
    });
});
