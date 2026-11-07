import { describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { shop } from './test/fixtures';
import { renderCanvas } from './test/render';

describe('focus requests from the side panel', () => {
    it('EDT-107, EDT-065: asking to focus a table selects it and each request is seen', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        act(() => store.getState().focusEntity(s.orders));
        expect(store.getState().ui.selection).toEqual([s.orders]);
        act(() => store.getState().select([]));
        // the same table again is a new request
        act(() => store.getState().focusEntity(s.orders));
        expect(store.getState().ui.selection).toEqual([s.orders]);
    });

    it('EDT-107: focusing leaves the panel as it is (selection on the canvas does not open the list)', () => {
        const s = shop();
        const { store } = renderCanvas(s.design);
        const panel = store.getState().ui.panel;
        act(() => store.getState().focusEntity(s.users));
        expect(store.getState().ui.panel).toEqual(panel);
    });
});
