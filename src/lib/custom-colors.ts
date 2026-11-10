// Colors a user made themselves, kept next to the built-in palette.

export const MAX_CUSTOM_COLORS = 12;
export const CUSTOM_COLORS_KEY = 'qbase.custom-colors';

/**
 * "#8EB7FF", "8eb7ff" and "#8bf" all become "#8eb7ff". Anything that is not a
 * 3 or 6 digit hex color gives null.
 */
export function normalizeHex(input: string): string | null {
    const hex = input.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        return `#${[...hex].map((c) => c + c).join('')}`.toLowerCase();
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`.toLowerCase();
    return null;
}

/** Puts a color first, drops any copy of it, and keeps at most `max` colors. */
export function addColor(
    colors: string[],
    color: string,
    max = MAX_CUSTOM_COLORS
): string[] {
    const normalized = normalizeHex(color);
    if (!normalized) return colors;
    return [normalized, ...colors.filter((c) => c !== normalized)].slice(
        0,
        max
    );
}

export function removeColor(colors: string[], color: string): string[] {
    const normalized = normalizeHex(color);
    return colors.filter((c) => c !== normalized);
}

/** The saved list, ignoring anything in storage that is not a valid color. */
export function parseSaved(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((c): c is string => typeof c === 'string')
            .map(normalizeHex)
            .filter((c): c is string => c !== null)
            .reduce<string[]>(
                (list, c) => (list.includes(c) ? list : [...list, c]),
                []
            )
            .slice(0, MAX_CUSTOM_COLORS);
    } catch {
        return [];
    }
}

/** Returns false when the browser would not store it (private mode, quota). */
export function writeSavedColors(colors: string[]): boolean {
    try {
        localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors));
        return true;
    } catch {
        return false;
    }
}
