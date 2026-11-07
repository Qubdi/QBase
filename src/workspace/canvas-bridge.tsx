import React, { useMemo, useRef } from 'react';
import {
    CANVAS_SLOT_SELECTOR,
    CanvasBridgeContext,
} from './canvas-bridge-context';
import type { Bridge, CanvasHandle } from './canvas-bridge-context';

/** Lives in the editor frame; the canvas registers itself below it. */
export const CanvasBridgeProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const handle = useRef<CanvasHandle | null>(null);
    const bridge = useMemo<Bridge>(
        () => ({
            register(next) {
                handle.current = next;
                return () => {
                    if (handle.current === next) handle.current = null;
                };
            },
            fitAll: () => handle.current?.fitAll(),
            toggleFilter: () => handle.current?.toggleFilter(),
            captureTarget: () =>
                handle.current?.captureTarget?.() ??
                document.querySelector<HTMLElement>(CANVAS_SLOT_SELECTOR),
            viewportOrigin: () =>
                handle.current?.viewportOrigin?.() ?? { x: 0, y: 0 },
        }),
        []
    );
    return (
        <CanvasBridgeContext.Provider value={bridge}>
            {children}
        </CanvasBridgeContext.Provider>
    );
};
