export const OVERSCAN_PX = 320;

export interface WindowRange {
    /** First and last row (inclusive) that the scroll position asks for. */
    start: number;
    end: number;
}

/**
 * Rows to draw for a scroll position. `heights[i]` is the height of row i
 * (measured or estimated); `top` is the scroll offset relative to the first
 * row and `viewport` the visible height.
 */
export function windowRange(
    heights: readonly number[],
    top: number,
    viewport: number,
    overscan = OVERSCAN_PX
): WindowRange {
    const n = heights.length;
    if (n === 0) return { start: 0, end: -1 };
    const lo = top - overscan;
    const hi = top + viewport + overscan;
    let offset = 0;
    let start = n - 1;
    let found = false;
    let end = n - 1;
    for (let i = 0; i < n; i++) {
        if (!found && offset + heights[i] > lo) {
            start = i;
            found = true;
        }
        if (offset >= hi) {
            end = i - 1;
            break;
        }
        offset += heights[i];
    }
    if (end < start) end = start;
    return { start, end };
}
