import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const touch = (x: number, y: number) => ({
    touches: [{ clientX: x, clientY: y }],
});

describe('EDT-009 a touch hold on a panel row opens its actions menu', () => {
    it('opens after half a second of holding the name', async () => {
        renderPanel(<TablesSection />, withTables(['users']));
        const row = screen.getByTestId('table-row');
        const name = screen.getByText('users');
        fireEvent.touchStart(name, touch(10, 10));
        expect(screen.queryByRole('menuitem')).toBeNull();
        act(() => void vi.advanceTimersByTime(600));
        vi.useRealTimers();
        const items = await screen.findAllByRole('menuitem');
        expect(items.map((i) => i.textContent)).toContain('Add Field');
        expect(row).toBeTruthy();
    });

    it('a short touch, or a moving finger does nothing', () => {
        renderPanel(<TablesSection />, withTables(['users']));
        const name = screen.getByText('users');
        fireEvent.touchStart(name, touch(10, 10));
        act(() => void vi.advanceTimersByTime(200));
        fireEvent.touchEnd(name);
        act(() => void vi.advanceTimersByTime(600));
        expect(screen.queryByRole('menuitem')).toBeNull();

        fireEvent.touchStart(name, touch(10, 10));
        fireEvent.touchMove(name, touch(10, 60));
        act(() => void vi.advanceTimersByTime(600));
        expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('a locked diagram has no actions to open on the visuals rows', () => {
        renderPanel(<TablesSection />, withTables(['users']), {
            readonly: true,
        });
        fireEvent.touchStart(screen.getByText('users'), touch(1, 1));
        act(() => void vi.advanceTimersByTime(600));
        const items = screen
            .queryAllByRole('menuitem')
            .map((i) => i.textContent);
        expect(items).not.toContain('Add Field');
    });
});
