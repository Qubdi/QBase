import React, {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useReducer,
    useRef,
    useState,
} from 'react';

import { windowRange } from './window-range';

/** Lists longer than this are windowed; shorter ones render every row, as a plain list. */
export const WINDOW_THRESHOLD = 60;

/** Viewport height assumed while the scroll box has not been measured (first render, tests). */
const FALLBACK_VIEWPORT = 600;
const FOCUSABLE =
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** The row's own toggle: an expander button that is not a menu trigger. */
const TOGGLE = 'button[aria-expanded]:not([aria-haspopup])';

interface Props<T> {
    items: readonly T[];
    getId: (item: T) => string;
    renderItem: (item: T, index: number) => React.ReactNode;
    /** Space under each row, in px (the `space-y-*` of the plain list). */
    gap?: number;
    /** Height guess for a row that has not been drawn yet. */
    estimate?: number;
    threshold?: number;
    /** Rows that must stay drawn (an open editor), besides the focused one. */
    keepIds?: readonly (string | undefined)[];
    /** Scrolled into view when it changes (a table opened from the canvas). */
    scrollToId?: string;
    /** Accessible name of the list when windowed. */
    label?: string;
}

/**
 * The rows of a side-panel list. Up to `threshold` rows it renders them all,
 * unchanged. Longer lists draw only the rows near the scroll position (plus the
 * focused and kept ones), with spacers standing in for the rest; row heights are
 * measured because an open row is much taller than a closed one. The scroll box
 * is the nearest `[data-window-root]` (or the parent element).
 */
export function WindowedList<T>({
    items,
    getId,
    renderItem,
    gap = 4,
    estimate = 44,
    threshold = WINDOW_THRESHOLD,
    keepIds = [],
    scrollToId,
    label,
}: Props<T>): React.ReactElement {
    const n = items.length;
    const windowed = n > threshold;

    const listRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLElement | null>(null);
    // measured row heights; a change re-renders through `bump`
    const [heights] = useState(() => new Map<string, number>());
    const observed = useRef(new Set<Element>());
    const observer = useRef<ResizeObserver | null>(null);
    const [, bump] = useReducer((x: number) => x + 1, 0);
    const [view, setView] = useState({ top: 0, height: 0, listTop: 0 });
    const [focusedId, setFocusedId] = useState<string | undefined>();
    const [forced, setForced] = useState<number | null>(null);
    const pendingFocus = useRef<'first' | 'last' | 'toggle'>('first');

    const ids = items.map(getId);
    const rowHeights = ids.map((id) => heights.get(id) ?? estimate + gap);
    const offsets: number[] = [];
    let total = 0;
    for (const h of rowHeights) {
        offsets.push(total);
        total += h;
    }
    // what the event handlers and effects read, kept current after each commit
    const latest = useRef({ ids, offsets, rowHeights, view });
    useLayoutEffect(() => {
        latest.current = { ids, offsets, rowHeights, view };
    });

    const measureView = useCallback(() => {
        const root = rootRef.current;
        const list = listRef.current;
        if (!root || !list) return;
        const r = root.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        const next = {
            top: root.scrollTop,
            height: root.clientHeight,
            listTop: l.top - r.top + root.scrollTop,
        };
        setView((prev) =>
            prev.top === next.top &&
            prev.height === next.height &&
            Math.abs(prev.listTop - next.listTop) < 1
                ? prev
                : next
        );
        // a focused row that lost focus is no longer kept
        if (!list.contains(document.activeElement)) setFocusedId(undefined);
    }, [setFocusedId]);

    // the scroll box: scroll position and size
    useEffect(() => {
        if (!windowed) return;
        const list = listRef.current;
        if (!list) return;
        const root =
            (list.closest('[data-window-root]') as HTMLElement | null) ??
            list.parentElement;
        if (!root) return;
        rootRef.current = root;
        let frame = 0;
        const onScroll = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                measureView();
            });
        };
        root.addEventListener('scroll', onScroll, { passive: true });
        const resize =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(() => measureView());
        resize?.observe(root);
        measureView();
        return () => {
            root.removeEventListener('scroll', onScroll);
            resize?.disconnect();
            if (frame) cancelAnimationFrame(frame);
        };
    }, [windowed, measureView]);

    // row heights: measured when drawn and whenever a row resizes
    const measureRow = useCallback(
        (el: Element): boolean => {
            const id = (el as HTMLElement).dataset.windowId;
            if (id === undefined) return false;
            const h = el.getBoundingClientRect().height;
            if (h <= 0 || heights.get(id) === h) return false;
            heights.set(id, h);
            return true;
        },
        [heights]
    );
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!windowed || !list) return;
        if (!observer.current && typeof ResizeObserver !== 'undefined') {
            observer.current = new ResizeObserver((entries) => {
                let changed = false;
                for (const entry of entries)
                    changed = measureRow(entry.target) || changed;
                if (changed) bump();
            });
        }
        const now = new Set(list.querySelectorAll('[data-window-id]'));
        let changed = false;
        for (const el of now) {
            if (!observed.current.has(el)) observer.current?.observe(el);
            changed = measureRow(el) || changed;
        }
        for (const el of observed.current)
            if (!now.has(el)) observer.current?.unobserve(el);
        observed.current = now;
        if (changed) bump();
        // the list may have moved inside the scroll box (a notice above it)
        measureView();
    });
    useEffect(
        () => () => {
            observer.current?.disconnect();
            observer.current = null;
        },
        []
    );
    // forget heights of rows that are gone (keeps the map from growing)
    useEffect(() => {
        if (heights.size <= n * 2) return;
        const live = new Set(ids);
        for (const id of [...heights.keys()])
            if (!live.has(id)) heights.delete(id);
    });

    const ensureVisible = useCallback(
        (index: number) => {
            const root = rootRef.current;
            const { offsets: o, rowHeights: h, view: v } = latest.current;
            if (!root || index < 0 || index >= o.length) return;
            const top = v.listTop + o[index];
            const bottom = top + h[index];
            const height = root.clientHeight || FALLBACK_VIEWPORT;
            if (top < root.scrollTop || bottom - top > height)
                root.scrollTop = top;
            else if (bottom > root.scrollTop + height)
                root.scrollTop = bottom - height;
            measureView();
        },
        [measureView]
    );

    // a row asked for from outside (opened from the canvas)
    useEffect(() => {
        if (!windowed || !scrollToId) return;
        const index = latest.current.ids.indexOf(scrollToId);
        if (index >= 0) ensureVisible(index);
    }, [windowed, scrollToId, ensureVisible]);

    // focus moved by keyboard onto a row that was not drawn
    useLayoutEffect(() => {
        if (forced === null) return;
        const el = listRef.current?.querySelector<HTMLElement>(
            `[data-window-index="${forced}"]`
        );
        if (!el) return;
        const focusable = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const target =
            pendingFocus.current === 'last'
                ? focusable[focusable.length - 1]
                : pendingFocus.current === 'toggle'
                  ? (el.querySelector<HTMLElement>(TOGGLE) ?? focusable[0])
                  : focusable[0];
        target?.focus();
        setForced(null);
    }, [forced]);

    if (!windowed) {
        return (
            <>
                {items.map((item, i) => (
                    <Fragment key={getId(item)}>{renderItem(item, i)}</Fragment>
                ))}
            </>
        );
    }

    const viewport = view.height || FALLBACK_VIEWPORT;
    const range = windowRange(rowHeights, view.top - view.listTop, viewport);
    const mounted = new Set<number>();
    for (let i = range.start; i <= range.end; i++) mounted.add(i);
    const pin = (id: string | undefined) => {
        if (id === undefined) return;
        const i = ids.indexOf(id);
        if (i >= 0) mounted.add(i);
    };
    pin(focusedId);
    for (const id of keepIds) pin(id);
    if (forced !== null && forced >= 0 && forced < n) mounted.add(forced);

    const children: React.ReactNode[] = [];
    let cursor = 0;
    const spacer = (key: string, to: number) => {
        if (to - cursor > 0.5)
            children.push(
                <div
                    key={key}
                    role="presentation"
                    aria-hidden="true"
                    style={{ height: to - cursor }}
                />
            );
        cursor = to;
    };
    for (const i of [...mounted].sort((a, b) => a - b)) {
        spacer(`s${i}`, offsets[i]);
        children.push(
            <div
                key={ids[i]}
                role="listitem"
                aria-setsize={n}
                aria-posinset={i + 1}
                data-window-id={ids[i]}
                data-window-index={i}
                style={{ paddingBottom: gap }}
            >
                {renderItem(items[i], i)}
            </div>
        );
        cursor = offsets[i] + rowHeights[i];
    }
    spacer('end', total);

    const go = (
        e: React.KeyboardEvent,
        index: number,
        which: typeof pendingFocus.current
    ) => {
        e.preventDefault();
        pendingFocus.current = which;
        ensureVisible(index);
        setForced(index);
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        const target = e.target as HTMLElement;
        const row = target.closest<HTMLElement>('[data-window-id]');
        if (!row || !listRef.current?.contains(row)) return;
        const index = Number(row.dataset.windowIndex);
        const has = (i: number) =>
            listRef.current?.querySelector(`[data-window-index="${i}"]`);
        if (e.key === 'Tab') {
            const focusable = [...row.querySelectorAll<HTMLElement>(FOCUSABLE)];
            if (!e.shiftKey && target === focusable[focusable.length - 1]) {
                if (index < n - 1 && !has(index + 1)) go(e, index + 1, 'first');
            } else if (e.shiftKey && target === focusable[0]) {
                if (index > 0 && !has(index - 1)) go(e, index - 1, 'last');
            }
        } else if (
            (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
            target.matches(TOGGLE)
        ) {
            const next = index + (e.key === 'ArrowDown' ? 1 : -1);
            if (next < 0 || next >= n) return;
            const el = has(next);
            if (el) {
                e.preventDefault();
                (
                    el.querySelector<HTMLElement>(TOGGLE) ??
                    el.querySelector<HTMLElement>(FOCUSABLE)
                )?.focus();
            } else go(e, next, 'toggle');
        }
    };

    return (
        // key events bubble up from the row controls; the list itself takes none
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
            ref={listRef}
            role="list"
            aria-label={label}
            onFocus={(e) => {
                const row = (e.target as HTMLElement).closest<HTMLElement>(
                    '[data-window-id]'
                );
                if (row) setFocusedId(row.dataset.windowId);
            }}
            onKeyDown={onKeyDown}
        >
            {children}
        </div>
    );
}
