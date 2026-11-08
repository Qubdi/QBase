import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blank, withTables } from '@/core/testing/helpers';
import { EditorFrame } from '../editor-frame';
import { Rail } from '../rail';
import { renderInEditor } from './test-harness';

const phone = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: !query.includes('min-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => false,
    }));

const frame = (design = blank()) =>
    renderInEditor(
        <HelmetProvider>
            <EditorFrame />
        </HelmetProvider>,
        { design }
    );

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('p8 EDT-001 to EDT-007, EDT-013 layout', () => {
    it('EDT-001/EDT-005: desktop shows the top bar, the rail, the panel (open at first) with its handle, and the canvas place', () => {
        const { container, store } = frame();
        expect(
            container.querySelector('[data-slot="navbar-left"]')
        ).toBeTruthy();
        expect(
            screen.getByRole('navigation', { name: 'Editor sections' })
        ).toBeTruthy();
        expect(store.getState().ui.panel.open).toBe(true);
        expect(
            screen.getByRole('slider', { name: 'Resize the side panel' })
        ).toBeTruthy();
        expect(container.querySelector('[data-slot="canvas"]')).toBeTruthy();
    });

    it('EDT-002: the rail lists New, Open, Tables, DBML, Links and Extras, and highlights the current section', () => {
        const { store } = renderInEditor(<Rail />, { design: blank('mysql') });
        for (const name of ['New', 'Open', 'Tables', 'DBML', 'Refs', 'Visuals'])
            expect(screen.getByRole('button', { name })).toBeTruthy();
        expect(
            screen
                .getByRole('button', { name: 'Tables' })
                .getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            screen
                .getByRole('button', { name: 'DBML' })
                .getAttribute('aria-pressed')
        ).toBe('false');
        fireEvent.click(screen.getByRole('button', { name: 'Refs' }));
        expect(store.getState().ui.panel.section).toBe('refs');
        expect(
            screen
                .getByRole('button', { name: 'Refs' })
                .getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            screen
                .getByRole('button', { name: 'Tables' })
                .getAttribute('aria-pressed')
        ).toBe('false');
    });

    it('EDT-003: clicking a rail section opens a hidden panel on that section', () => {
        const { store } = renderInEditor(<Rail />, {
            design: blank(),
            panelOpen: false,
        });
        expect(store.getState().ui.panel.open).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'DBML' }));
        expect(store.getState().ui.panel.open).toBe(true);
        expect(store.getState().ui.panel.section).toBe('dbml');
    });

    it('EDT-004: the handle moves the width by keys, never under a quarter of the width, and hiding the panel removes it', () => {
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
            1400
        );
        const { store } = frame();
        const handle = () =>
            screen.queryByRole('slider', { name: 'Resize the side panel' });
        const before = Number(handle()!.getAttribute('aria-valuenow'));
        expect(before).toBeGreaterThanOrEqual(240);
        fireEvent.keyDown(handle()!, { key: 'ArrowRight' });
        expect(Number(handle()!.getAttribute('aria-valuenow'))).toBe(
            Math.max(before + 20, 337)
        );
        for (let i = 0; i < 60; i++)
            fireEvent.keyDown(handle()!, { key: 'ArrowLeft' });
        expect(Number(handle()!.getAttribute('aria-valuenow'))).toBe(337);
        act(() => store.getState().hidePanel());
        expect(handle()).toBeNull();
    });

    it('EDT-013: the tab title reads QBase - <diagram name>', async () => {
        frame();
        await vi.waitFor(() => expect(document.title).toBe('QBase - Test'));
    });

    it('EDT-006/EDT-007: on a phone the panel is a drawer opened by the pencil button, with a section drop-down', async () => {
        phone();
        const { store } = frame(withTables(['a']));
        expect(store.getState().ui.panel.open).toBe(false);
        fireEvent.click(
            screen.getByRole('button', { name: 'Open the editing panel' })
        );
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Manage Diagram')).toBeTruthy();
        expect(
            within(dialog).getByRole('combobox', { name: 'Section' })
        ).toBeTruthy();
    });
});
