import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { forget } from '../clip-memory';
import { useEditorClipboard } from '../use-editor-clipboard';

vi.mock('@/lib/utils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getOperatingSystem: () => 'windows',
}));

const Host: React.FC = () => {
    useEditorClipboard();
    return null;
};

const press = (key: 'c' | 'v') =>
    fireEvent.keyDown(document, {
        key,
        code: `Key${key.toUpperCase()}`,
        ctrlKey: true,
    });

const setup = (readonly = false) => {
    const design = withTables(['users', 'orders']);
    const view = renderPanel(<Host />, design, { readonly });
    return { ...view, ids: design.entities.order };
};
const names = (store: ReturnType<typeof setup>['store']) => {
    const d = store.getState().design;
    return d.entities.order.map((id) => d.entities.byId[id].name);
};

describe('EDT-227 to EDT-237 copy and paste of tables', () => {
    beforeEach(() => forget());

    it('copies the selected table and pastes a _copy with a notice each time', async () => {
        const { store, ids } = setup();
        act(() => store.getState().select([ids[0]]));
        press('c');
        expect(await screen.findByText('Table copied')).toBeTruthy();
        expect(screen.getByText('Press Ctrl+V to paste it.')).toBeTruthy();
        press('v');
        expect(names(store)).toEqual(['users', 'orders', 'users_copy']);
        expect(await screen.findByText('Table pasted')).toBeTruthy();
        press('v');
        expect(names(store)).toEqual([
            'users',
            'orders',
            'users_copy',
            'users_copy2',
        ]);
    });

    it('moves each paste one slot to the right (EDT-232)', () => {
        const { store, ids } = setup();
        act(() => store.getState().select([ids[0]]));
        press('c');
        press('v');
        press('v');
        const d = store.getState().design;
        const xs = d.entities.order.slice(2).map((id) => d.entities.byId[id].x);
        expect(xs[1] - xs[0]).toBe(264);
    });

    it('pastes several tables as one undo step and says how many', async () => {
        const { store, ids } = setup();
        act(() => store.getState().select([...ids]));
        press('c');
        expect(await screen.findByText('2 tables copied')).toBeTruthy();
        press('v');
        expect(await screen.findByText('2 tables pasted')).toBeTruthy();
        store.getState().undo();
        expect(names(store)).toEqual(['users', 'orders']);
    });

    it('does nothing with nothing selected or nothing copied', () => {
        const { store } = setup();
        press('c');
        press('v');
        expect(names(store)).toEqual(['users', 'orders']);
    });

    it('is not pasted into a read-only diagram (EDT-237)', () => {
        const { store, ids } = setup(true);
        act(() => store.getState().select([ids[0]]));
        press('c');
        press('v');
        expect(names(store)).toEqual(['users', 'orders']);
    });
});
