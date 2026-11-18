import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { EntityForm } from '../entity-form';

// The sections of a table form are an accordion: opening one folds the one that
// was open, which is the long Fields above it. The side panel is scrolled down
// at that moment, so what was clicked used to jump up out of sight and the panel
// seemed to have scrolled down: the user had to scroll back up to see the result.
// The header that was clicked is now kept where it is on screen.
//
// A test has no layout, so a small one is made up: the box is 900 px high, a
// section header is 28 px, an open section's body is 400 px, and the headers
// start 700 px down the scroll content.

const VIEW = 900;
const HEADER = 28;
const BODY = 400;
const ORIGIN = 700;
const HEADERS = '[data-section] > h3 > button';

const isOpen = (section: Element) =>
    section.querySelector('h3 button')?.getAttribute('aria-expanded') ===
    'true';

let restoreRects = () => {};
let scrollIntoView = vi.fn();
const realScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
    // jsdom keeps scrollTop at 0; remember what was set
    const stored = new WeakMap<object, number>();
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
        configurable: true,
        get() {
            return stored.get(this) ?? 0;
        },
        set(v: number) {
            stored.set(this, v);
        },
    });
    const real = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.hasAttribute('data-window-root'))
            return { top: 0, bottom: VIEW, height: VIEW } as DOMRect;
        if (this.matches(HEADERS)) {
            const mine = this.closest('[data-section]');
            const box = this.closest('[data-window-root]') as HTMLElement;
            let top = ORIGIN - box.scrollTop;
            for (const s of document.querySelectorAll('[data-section]')) {
                if (s === mine) break;
                top += HEADER + (isOpen(s) ? BODY : 0);
            }
            return { top, bottom: top + HEADER, height: HEADER } as DOMRect;
        }
        return real.call(this);
    };
    restoreRects = () => {
        HTMLElement.prototype.getBoundingClientRect = real;
    };
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
    restoreRects();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .scrollTop;
    Element.prototype.scrollIntoView = realScrollIntoView;
});

/** The form of a table in a scroll box, scrolled down by `scrolled` pixels. */
const show = (scrolled: number) => {
    const design = withTables(['orders']);
    const entity = design.entities.byId[design.entities.order[0]];
    renderPanel(
        <div data-window-root style={{ overflowY: 'auto' }}>
            <EntityForm entity={entity} />
        </div>,
        design
    );
    const box = document.querySelector('[data-window-root]') as HTMLElement;
    box.scrollTop = scrolled;
    return box;
};

const header = (name: string) => screen.getByRole('button', { name });

describe('the sections of a table form in a scrolled panel', () => {
    it.each(['Indexes', 'Check Constraints', 'Description'])(
        'keep %s where it was when it is clicked and Fields above it folds',
        async (name) => {
            const box = show(600);
            const clicked = header(name);
            const before = clicked.getBoundingClientRect().top;
            expect(before).toBeGreaterThanOrEqual(0);
            expect(before).toBeLessThan(VIEW);

            await userEvent.click(clicked);

            expect(clicked.getAttribute('aria-expanded')).toBe('true');
            expect(header('Fields').getAttribute('aria-expanded')).toBe(
                'false'
            );
            // without the fix the box stayed at 600 and the header moved up by BODY
            expect(box.scrollTop).toBe(600 - BODY);
            expect(clicked.getBoundingClientRect().top).toBe(before);
        }
    );

    it('keeps Fields where it was when it is opened again', async () => {
        const box = show(0);
        await userEvent.click(header('Indexes'));
        box.scrollTop = 100;
        const fields = header('Fields');
        const before = fields.getBoundingClientRect().top;

        await userEvent.click(fields);

        expect(fields.getAttribute('aria-expanded')).toBe('true');
        expect(fields.getBoundingClientRect().top).toBe(before);
    });

    it('leaves the scroll alone when nothing above the header changes', async () => {
        const box = show(0);
        await userEvent.click(header('Fields'));
        box.scrollTop = 50;
        await userEvent.click(header('Description'));
        expect(box.scrollTop).toBe(50);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('keeps the header of Indexes in place when Add Index in the footer opens it', async () => {
        const box = show(600);
        const indexes = header('Indexes');
        const before = indexes.getBoundingClientRect().top;

        await userEvent.click(
            screen.getByRole('button', { name: 'Add Index' })
        );

        expect(indexes.getAttribute('aria-expanded')).toBe('true');
        expect(box.scrollTop).toBe(600 - BODY);
        expect(indexes.getBoundingClientRect().top).toBe(before);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls to the section Add Index opens when its header was not in view', async () => {
        show(0);
        // at the top of the table, the Indexes header is below the box
        expect(header('Indexes').getBoundingClientRect().top).toBeGreaterThan(
            VIEW
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Add Index' })
        );

        expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
            block: 'start',
        });
        expect(
            (scrollIntoView.mock.contexts[0] as HTMLElement).textContent
        ).toContain('Indexes');
    });
});
