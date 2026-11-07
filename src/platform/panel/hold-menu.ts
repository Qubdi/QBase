import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

const HOLD_MS = 550;
const SLOP_PX = 10;

/**
 * A touch screen has no right button, so holding a finger still on a panel
 * row for about half a second opens the row's actions menu (EDT-009 change).
 * `menu` goes to the `DropdownMenu`; `hold` is spread on an element around the
 * row. A press in a text field keeps its own meaning; after a hold the tap that
 * would follow is cancelled so the row does not also open.
 */
export function useHoldMenu(enabled = true) {
    const [open, setOpen] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const fired = useRef(false);
    const origin = useRef<{ x: number; y: number }>(undefined);

    const stop = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = undefined;
    }, []);
    useEffect(() => stop, [stop]);

    const hold = {
        onTouchStart: (event: React.TouchEvent) => {
            stop();
            if (!enabled || event.touches.length !== 1) return;
            const target = event.target as Element;
            if (target.closest('input, textarea, select')) return;
            const touch = event.touches[0];
            origin.current = { x: touch.clientX, y: touch.clientY };
            fired.current = false;
            timer.current = setTimeout(() => {
                fired.current = true;
                setOpen(true);
            }, HOLD_MS);
        },
        onTouchMove: (event: React.TouchEvent) => {
            const touch = event.touches[0];
            const from = origin.current;
            if (
                from &&
                touch &&
                Math.hypot(touch.clientX - from.x, touch.clientY - from.y) >
                    SLOP_PX
            )
                stop();
        },
        onTouchEnd: (event: React.TouchEvent) => {
            stop();
            if (fired.current && event.cancelable) event.preventDefault();
            fired.current = false;
        },
        onTouchCancel: stop,
    };
    return { menu: { open, onOpenChange: setOpen }, hold };
}
