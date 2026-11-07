/** Width limits of the side panel in pixels (spec A7). */
export const PANEL_MIN = 350;

/** A quarter of the container, but never under the minimum. */
export const defaultPanelWidth = (container: number): number =>
    Math.max(PANEL_MIN, Math.round(container * 0.25));

/** Keeps a dragged width between the minimum and 99% of the container. */
export const clampPanelWidth = (width: number, container: number): number =>
    Math.round(
        Math.min(
            Math.max(width, PANEL_MIN),
            Math.max(PANEL_MIN, container * 0.99)
        )
    );
