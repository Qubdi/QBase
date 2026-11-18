import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * The box an element scrolls in: the side panel's list (marked
 * `data-window-root`), or the nearest ancestor that scrolls.
 */
export const scrollBoxOf = (el: HTMLElement): HTMLElement | null => {
    const marked = el.closest<HTMLElement>('[data-window-root]');
    if (marked) return marked;
    for (let p = el.parentElement; p; p = p.parentElement) {
        const { overflowY } = getComputedStyle(p);
        if (overflowY === 'auto' || overflowY === 'scroll') return p;
    }
    return null;
};

interface Held {
    el: HTMLElement;
    top: number;
    visible: boolean;
}

/**
 * Keeps something where it is on screen while the layout around it changes.
 *
 * Folding a section above the one that was clicked shortens the scroll box, and
 * the box keeps its scroll position, so what was clicked jumps up out of sight
 * and the box seems to have scrolled down: the user has to scroll back to see
 * the result. The browser's own compensation does not help, because it holds on
 * to the first thing in view, which is inside the section that goes away.
 *
 * Call the returned function with the element (before the state change that will
 * move it); after the render that `changed` stands for, the scroll box is moved
 * by as much as the element moved, so it is where it was. If it was not in view
 * (opened by a button elsewhere), it is scrolled to the top of the box instead,
 * so that what was opened is seen.
 */
export function useKeepInPlace(changed: unknown): (el: HTMLElement) => void {
    const held = useRef<Held | null>(null);
    useLayoutEffect(() => {
        const h = held.current;
        held.current = null;
        if (!h?.el.isConnected) return;
        const box = scrollBoxOf(h.el);
        if (!box) return;
        if (h.visible) {
            const shift = h.el.getBoundingClientRect().top - h.top;
            if (shift !== 0) box.scrollTop += shift;
        } else {
            h.el.scrollIntoView?.({ block: 'start' });
        }
    }, [changed]);
    return useCallback((el: HTMLElement) => {
        const top = el.getBoundingClientRect().top;
        const view = scrollBoxOf(el)?.getBoundingClientRect();
        held.current = {
            el,
            top,
            visible: view !== undefined && top >= view.top && top < view.bottom,
        };
    }, []);
}
