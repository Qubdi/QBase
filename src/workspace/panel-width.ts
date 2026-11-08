/** Width of the icon rail in pixels; the panel's percentages count the space right of it. */
export const RAIL_WIDTH = 52;

/** Smallest panel in pixels, whatever the window: below this the forms do not fit. */
export const PANEL_FLOOR = 240;

/** The panel is never narrower than a quarter of the space beside the rail. */
export const minPanelWidth = (container: number): number =>
    Math.max(PANEL_FLOOR, Math.round(container * 0.25));

/** It starts at its minimum: a quarter of the space beside the rail. */
export const defaultPanelWidth = (container: number): number =>
    minPanelWidth(container);

/** Keeps a dragged width between the minimum and 99% of the container. */
export const clampPanelWidth = (width: number, container: number): number =>
    Math.round(
        Math.min(
            Math.max(width, minPanelWidth(container)),
            Math.max(minPanelWidth(container), container * 0.99)
        )
    );
