/**
 * Reads a saved setting. Browsers can refuse storage (private windows, blocked
 * site data), and the page must still open with the defaults.
 */
export const readStored = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

/** Saves a setting; a browser that refuses storage just forgets it. */
export const writeStored = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // not saved: the setting still applies until the page is closed
    }
};
