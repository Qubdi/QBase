import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Point } from './flow-model';

/** Space kept between a floating card and the window edge. */
export const EDGE = 8;

/** `value` held inside `[low, high]`; the low edge wins when the range is empty. */
export const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(value, high));

/**
 * Where a floating card goes so that all of it stays inside the visible window
 * (on a phone the visual viewport, which the on-screen keyboard shrinks). The
 * card is measured after it is drawn; `deps` say when to measure again.
 */
export function useClampedPlacement(
    ref: RefObject<HTMLElement | null>,
    at: Point,
    deps: readonly unknown[] = []
): { left: number; top: number } {
    const [placed, setPlaced] = useState({ left: at.x, top: at.y });
    useLayoutEffect(() => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) {
            setPlaced({ left: at.x, top: at.y });
            return;
        }
        const view = window.visualViewport;
        const left0 = view?.offsetLeft ?? 0;
        const top0 = view?.offsetTop ?? 0;
        const width = view?.width ?? window.innerWidth;
        const height = view?.height ?? window.innerHeight;
        setPlaced({
            left: clamp(at.x, left0 + EDGE, left0 + width - rect.width - EDGE),
            top: clamp(at.y, top0 + EDGE, top0 + height - rect.height - EDGE),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's own list of re-clamp triggers
    }, [at.x, at.y, ref, ...deps]);
    return placed;
}
