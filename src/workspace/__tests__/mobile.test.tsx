import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { EditorFrame } from '../editor-frame';
import {
    clampPanelWidth,
    defaultPanelWidth,
    PANEL_FLOOR,
} from '../panel-width';
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

describe('phone layout (EDT-004 to EDT-010, SHL-066 to SHL-073)', () => {
    beforeEach(phone);
    afterEach(() => vi.unstubAllGlobals());

    const frame = (readonly = false) =>
        renderInEditor(
            <HelmetProvider>
                <EditorFrame />
            </HelmetProvider>,
            { design: blank(), readonly }
        );

    it('has the compact bar, no icon rail until the menu button is pressed, and the panel starts hidden', () => {
        const { store } = frame();
        expect(
            screen.queryByRole('navigation', { name: 'Editor sections' })
        ).toBeNull();
        expect(store.getState().ui.panel.open).toBe(false);
        fireEvent.click(
            screen.getByRole('button', { name: 'Show the tool strip' })
        );
        expect(
            screen.getByRole('navigation', { name: 'Editor sections' })
        ).toBeTruthy();
        // the sheet covers the bar; Escape closes it
        fireEvent.keyDown(screen.getByRole('dialog', { name: 'Sidebar' }), {
            key: 'Escape',
        });
        expect(
            screen.queryByRole('navigation', { name: 'Editor sections' })
        ).toBeNull();
    });

    it('the pencil button opens the panel drawer', () => {
        const { store } = frame();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open the editing panel' })
        );
        expect(store.getState().ui.panel.open).toBe(true);
    });

    it('a read-only diagram has no pencil button', () => {
        frame(true);
        expect(
            screen.queryByRole('button', { name: 'Open the editing panel' })
        ).toBeNull();
    });

    it('the menus are on the phone too; the saved mark and Lint stay on the desktop bar (SHL-069)', () => {
        const { container } = frame();
        expect(screen.getByRole('menuitem', { name: 'Actions' })).toBeTruthy();
        expect(container.querySelector('[aria-label^="Saved"]')).toBeNull();
    });
});

describe('side panel width (spec A7)', () => {
    it('starts at a quarter of the width but not under 240 px (the old editor had no floor)', () => {
        expect(defaultPanelWidth(2000)).toBe(500);
        expect(defaultPanelWidth(800)).toBe(PANEL_FLOOR);
    });
    it('is clamped between a quarter and 99% of the container', () => {
        expect(clampPanelWidth(10, 1500)).toBe(375);
        expect(clampPanelWidth(5000, 1500)).toBe(1485);
        expect(clampPanelWidth(600, 1500)).toBe(600);
        expect(clampPanelWidth(900, 300)).toBe(297);
    });
});
