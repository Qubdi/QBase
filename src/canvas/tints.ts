import { MEMO_TINT } from '@/core/model/memo';

/**
 * Colour recipes shared by the nodes. Each one mixes the record's own colour
 * with the page, so light and dark themes both read well.
 */
const mix = (colour: string, percent: number, into = 'transparent') =>
    `color-mix(in srgb, ${colour} ${percent}%, ${into})`;

/** The wash behind a table's header (EDT-078). */
export const headerWash = (colour: string) => mix(colour, 22);

/** The 15% fill of an area (EDT-201). */
export const regionFill = (tint: string) => mix(tint, 15);

/** The name strip of an area. */
export const regionStrip = (tint: string) => mix(tint, 45);

/** The pale body of a note: lighter in the light theme, darker in the dark one (EDT-212). */
export const memoPale = (tint: string) => mix(tint, 28, 'hsl(var(--card))');

/** A colour input needs `#rrggbb`; anything else falls back to the note yellow. */
export function asHex(colour: string): string {
    return /^#[0-9a-f]{6}$/i.test(colour) ? colour : MEMO_TINT;
}
