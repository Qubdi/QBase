import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { TablesSection } from '../tables-section';
import { WindowedList } from '../windowed-list';
import { windowRange } from '../window-range';

const VIEW = 300;
const ROW = 50; // 46 + 4 gap, the estimate

/** jsdom has no layout: give the scroll box a height and every row a height. */
function layout() {
    scrollable();
    restoreRects = movingRects();
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
            return this.hasAttribute('data-window-root') ? VIEW : 0;
        },
    });
}
/** jsdom keeps scrollTop at 0; remember what was set. */
function scrollable() {
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
}
/** The list sits at the top of the scroll content: its rect moves up as the box scrolls. */
function movingRects() {
    const real = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
        const rect = real.call(this);
        if (this.getAttribute('role') !== 'list') return rect;
        const root = this.closest('[data-window-root]') as HTMLElement;
        return { ...rect, top: -root.scrollTop };
    };
    return () => {
        HTMLElement.prototype.getBoundingClientRect = real;
    };
}
let restoreRects = () => {};
afterEach(() => {
    restoreRects();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .scrollTop;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .clientHeight;
});

const rowsOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

const List: React.FC<{ n: number; keep?: string; scrollTo?: string }> = ({
    n,
    keep,
    scrollTo,
}) => (
    <div data-window-root data-testid="root" style={{ overflowY: 'auto' }}>
        <WindowedList
            items={rowsOf(n)}
            getId={(r) => r.id}
            keepIds={[keep]}
            scrollToId={scrollTo}
            estimate={46}
            renderItem={(r) => (
                <div>
                    <button type="button" aria-expanded={false}>
                        toggle {r.id}
                    </button>
                    <button type="button">more {r.id}</button>
                </div>
            )}
        />
    </div>
);

const drawn = () => screen.queryAllByRole('listitem').length;
const frame = () =>
    act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
const scrollTo = async (top: number) => {
    const root = screen.getByTestId('root');
    root.scrollTop = top;
    fireEvent.scroll(root);
    await frame();
};

describe('windowRange', () => {
    it('covers the viewport plus the overscan', () => {
        const heights = Array(500).fill(50);
        expect(windowRange(heights, 0, 300, 100)).toEqual({ start: 0, end: 7 });
        // rows 40..: top 2000 minus 100 overscan
        const r = windowRange(heights, 2000, 300, 100);
        expect(r.start).toBe(38);
        expect(r.end).toBe(47);
    });
    it('uses the real height of tall rows', () => {
        const heights = [50, 600, 50, 50, 50];
        expect(windowRange(heights, 0, 100, 0)).toEqual({ start: 0, end: 1 });
        expect(windowRange(heights, 300, 100, 0).start).toBe(1);
    });
    it('is empty for no rows', () => {
        expect(windowRange([], 0, 100).end).toBe(-1);
    });
});

describe('WindowedList', () => {
    it('renders a short list as plain rows, with no list wrapper', () => {
        layout();
        render(<List n={60} />);
        expect(screen.queryByRole('list')).toBeNull();
        expect(screen.getAllByRole('button', { name: /^toggle/ })).toHaveLength(
            60
        );
    });

    it('draws only the rows near the top of a long list, with counts', () => {
        layout();
        render(<List n={500} />);
        const n = drawn();
        expect(n).toBeGreaterThan(5);
        expect(n).toBeLessThan(30);
        const first = screen.getAllByRole('listitem')[0];
        expect(first.getAttribute('aria-setsize')).toBe('500');
        expect(first.getAttribute('aria-posinset')).toBe('1');
        expect(screen.getByText('toggle r0')).toBeTruthy();
        expect(screen.queryByText('toggle r300')).toBeNull();
    });

    it('draws the rows at the new scroll position and keeps the total height', async () => {
        layout();
        render(<List n={500} />);
        await scrollTo(ROW * 300);
        expect(screen.getByText('toggle r302')).toBeTruthy();
        expect(screen.queryByText('toggle r0')).toBeNull();
        const items = screen.getAllByRole('listitem');
        expect(items[0].getAttribute('aria-posinset')).toMatch(/^2[89]\d$/);
        const list = screen.getByRole('list');
        const spacers = [...list.children].filter(
            (c) => c.getAttribute('role') === 'presentation'
        ) as HTMLElement[];
        const height = (e: HTMLElement) => parseFloat(e.style.height);
        const total =
            spacers.reduce((s, e) => s + height(e), 0) + items.length * ROW;
        expect(total).toBe(500 * ROW);
        // the scroll position itself is the browser's: it is not reset
        expect(screen.getByTestId('root').scrollTop).toBe(ROW * 300);
    });

    it('keeps the focused row drawn after it scrolls away', async () => {
        layout();
        render(<List n={500} />);
        screen.getByText('more r3').focus();
        await scrollTo(ROW * 300);
        expect(document.activeElement?.textContent).toBe('more r3');
        expect(screen.getByText('more r3')).toBeTruthy();
        expect(screen.getByText('toggle r302')).toBeTruthy();
    });

    it('keeps a kept (open) row drawn', async () => {
        layout();
        render(<List n={500} keep="r5" />);
        await scrollTo(ROW * 300);
        expect(screen.getByText('toggle r5')).toBeTruthy();
    });

    it('scrolls a requested row into view', async () => {
        layout();
        const { rerender } = render(<List n={500} />);
        rerender(<List n={500} scrollTo="r400" />);
        await frame();
        expect(screen.getByTestId('root').scrollTop).toBeGreaterThan(ROW * 390);
        expect(screen.getByText('toggle r400')).toBeTruthy();
    });

    it('Tab past the last drawn row moves on to the next row', async () => {
        layout();
        render(<List n={500} />);
        await frame();
        const last = screen.getAllByRole('listitem').slice(-1)[0];
        const pos = Number(last.getAttribute('aria-posinset'));
        (last.querySelectorAll('button')[1] as HTMLElement).focus();
        await userEvent.tab();
        expect(document.activeElement?.textContent).toBe(`toggle r${pos}`);
    });

    it('arrow keys move between row toggles, including undrawn ones', async () => {
        layout();
        render(<List n={500} />);
        screen.getByText('toggle r0').focus();
        await userEvent.keyboard('{ArrowDown}');
        expect(document.activeElement?.textContent).toBe('toggle r1');
        await userEvent.keyboard('{ArrowUp}');
        expect(document.activeElement?.textContent).toBe('toggle r0');
    });
});

describe('the Tables section with many tables', () => {
    it('draws a window of rows, keeps the toggle labels and filters the whole list', async () => {
        const names = Array.from({ length: 300 }, (_, i) => `t${i}`);
        renderPanel(<TablesSection />, withTables(names));
        expect(screen.getAllByTestId('table-row').length).toBeLessThan(40);
        expect(
            screen.getByRole('button', { name: 'Show or hide the details: t0' })
        ).toBeTruthy();
        await userEvent.type(screen.getByLabelText('Filter'), 't299');
        expect(screen.getAllByTestId('table-row')).toHaveLength(1);
    });
});
