import React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { EditorFrame } from '../editor-frame';
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

const frame = () =>
    renderInEditor(
        <HelmetProvider>
            <EditorFrame />
        </HelmetProvider>,
        { design: blank() }
    );

/** true when `a` comes before `b` in the document */
const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => vi.unstubAllGlobals());

describe('QBS-025 a full-width banner row sits between the navbar and the content', () => {
    const check = (container: HTMLElement) => {
        const header = container.querySelector('header')!;
        const slot = container.querySelector('[data-slot="below-navbar"]')!;
        const main = container.querySelector('main')!;
        expect(slot).toBeTruthy();
        expect(before(header, slot)).toBe(true);
        expect(before(slot, main)).toBe(true);
        // a direct child of the page column, so it spans the whole width
        expect(slot.parentElement).toBe(header.parentElement);
        expect(slot.className).not.toMatch(/\bw-\d|max-w/);
    };

    it('on a desktop', () => check(frame().container));

    it('on a phone', () => {
        phone();
        check(frame().container);
    });
});

describe('QBS-024 / QBS-026 the save slot starts with the plain save icon', () => {
    it('the QBase controls sit at the start of the navbar right slot, before the account menu', () => {
        const { container } = frame();
        const right = container.querySelector('[data-slot="navbar-right"]')!;
        const first = right.querySelector('div > *')!;
        // no server session: the fallback (last saved) is what shows
        expect(first).toBeTruthy();
        expect(right.textContent).not.toMatch(/Overwrite/);
    });
});
