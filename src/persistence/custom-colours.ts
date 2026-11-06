import { KEY_PREFIX, readJson, writeJson } from './key-value-store';
import type { KeyValueStore } from './key-value-store';

export const CUSTOM_COLOURS_KEY = `${KEY_PREFIX}custom-colors`;
export const MAX_CUSTOM_COLOURS = 12;

/** `#rgb` or `#rrggbb` in any case becomes `#rrggbb` lower-case; anything else is undefined. */
export function normaliseColour(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.trim().toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
    if (short)
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    return /^#[0-9a-f]{6}$/.test(text) ? text : undefined;
}

/** The saved colours; invalid entries are ignored, repeats and extras dropped. */
export function readCustomColours(store: KeyValueStore | undefined): string[] {
    const raw = readJson<unknown>(store, CUSTOM_COLOURS_KEY, []);
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        const colour = normaliseColour(item);
        if (colour && !out.includes(colour)) out.push(colour);
    }
    return out.slice(0, MAX_CUSTOM_COLOURS);
}

/** Remembers a colour as the most recent one; at most 12 are kept. */
export function rememberColour(
    store: KeyValueStore | undefined,
    value: string
): string[] {
    const colour = normaliseColour(value);
    const current = readCustomColours(store);
    if (!colour) return current;
    const next = [colour, ...current.filter((c) => c !== colour)].slice(
        0,
        MAX_CUSTOM_COLOURS
    );
    writeJson(store, CUSTOM_COLOURS_KEY, next);
    return next;
}
