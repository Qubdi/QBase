import { MEMO_TINT } from '@/core/model/memo';

/**
 * Colour recipes shared by the nodes. Each one mixes the record's own colour
 * with the page, so light and dark themes both read well.
 */
const mix = (colour: string, percent: number, into = 'transparent') =>
    `color-mix(in srgb, ${colour} ${percent}%, ${into})`;

/** The wash behind a table's header (EDT-078): 135 degrees, 20 % fading to 6 %. */
export const headerWash = (colour: string) =>
    `linear-gradient(135deg, ${mix(colour, 20)}, ${mix(colour, 6)})`;

/** The 8.2 % fill of an area (EDT-201). */
export const regionFill = (tint: string) => mix(tint, 8.2);

/**
 * The pale body of a note (EDT-212): the colour at 30 % over white in the
 * light theme and over black in the dark one (`--memo-base`, set per theme in
 * the stylesheet), which gives the dark olive of a yellow note.
 */
export const memoPale = (tint: string) =>
    mix(tint, 30, 'var(--memo-base, #fff)');

/** A colour input needs `#rrggbb`; anything else falls back to the note yellow. */
export function asHex(colour: string): string {
    return /^#[0-9a-f]{6}$/i.test(colour) ? colour : MEMO_TINT;
}
