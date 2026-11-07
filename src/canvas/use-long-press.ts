import { useEffect } from 'react';
import type { Point } from './flow-model';

const HOLD_MS = 550;
const SLOP_PX = 10;

/**
 * Touch screens have no right button, so holding a finger still for about half
 * a second asks for the same menu (EDT-009 change). `onHold` gets the page
 * point and the element that was touched.
 */
export function useLongPress(
    host: HTMLElement | null,
    enabled: boolean,
    onHold: (at: Point, target: Element) => void
): void {
    useEffect(() => {
        if (!host || !enabled) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let origin: Point | undefined;

        const stop = () => {
            clearTimeout(timer);
            timer = undefined;
        };
        const start = (event: TouchEvent) => {
            stop();
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            origin = { x: touch.clientX, y: touch.clientY };
            const target = event.target as Element;
            timer = setTimeout(() => onHold(origin!, target), HOLD_MS);
        };
        const move = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (
                origin &&
                touch &&
                Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) >
                    SLOP_PX
            )
                stop();
        };

        // capture: the pan and zoom layer stops touch events from bubbling
        host.addEventListener('touchstart', start, {
            passive: true,
            capture: true,
        });
        host.addEventListener('touchmove', move, {
            passive: true,
            capture: true,
        });
        host.addEventListener('touchend', stop);
        host.addEventListener('touchcancel', stop);
        return () => {
            stop();
            host.removeEventListener('touchstart', start, true);
            host.removeEventListener('touchmove', move, true);
            host.removeEventListener('touchend', stop);
            host.removeEventListener('touchcancel', stop);
        };
    }, [host, enabled, onHold]);
}
