import type { ExtraKeys } from './column';
import type { Id } from './id';

/** A rectangle on the canvas: where its top-left corner is and how big it is. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * A tinted zone drawn behind tables to group them. Its geometry lives in one
 * `box`; `tint` is a CSS hex colour.
 */
export interface Region {
    id: Id;
    label: string;
    tint: string;
    box: Box;
    extra?: ExtraKeys;
}

export const REGION_SIZE = { width: 300, height: 200 };
