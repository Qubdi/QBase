import { createContext, useContext, useEffect, useRef } from 'react';

/** What the canvas lets the workspace ask of it (menus, shortcuts, image export). */
export interface CanvasHandle {
    /** animate the view so every table is visible */
    fitAll(): void;
    /** show or hide the table filter panel */
    toggleFilter(): void;
    /** the element whose pixels make an image export; defaults to the canvas slot */
    captureTarget?(): HTMLElement | null;
}

export interface Bridge {
    register(handle: CanvasHandle): () => void;
    fitAll(): void;
    toggleFilter(): void;
    captureTarget(): HTMLElement | null;
}

const none: Bridge = {
    register: () => () => undefined,
    fitAll: () => undefined,
    toggleFilter: () => undefined,
    captureTarget: () => null,
};

export const CanvasBridgeContext = createContext<Bridge>(none);

/** The element a canvas gives away for capture when it does not name its own. */
export const CANVAS_SLOT_SELECTOR = '[data-slot="canvas"]';

/** What the workspace calls: the canvas actions, quiet when no canvas is mounted. */
export const useCanvasActions = (): Omit<Bridge, 'register'> =>
    useContext(CanvasBridgeContext);

/** The canvas calls this once with its handle; it is unregistered on unmount. */
export function useRegisterCanvas(handle: CanvasHandle): void {
    const bridge = useContext(CanvasBridgeContext);
    const latest = useRef(handle);
    latest.current = handle;
    useEffect(
        () =>
            bridge.register({
                fitAll: () => latest.current.fitAll(),
                toggleFilter: () => latest.current.toggleFilter(),
                captureTarget: () => latest.current.captureTarget?.() ?? null,
            }),
        [bridge]
    );
}
