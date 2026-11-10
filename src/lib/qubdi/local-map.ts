/**
 * A JSON object kept in localStorage under `key`; empty when missing, broken,
 * blocked or not a plain object (an array or a number is no map). The result
 * has no prototype, so a key like `toString` or `constructor` is never found
 * on it unless it was stored.
 */
export const readJsonMap = <T>(key: string): Record<string, T> => {
    const map: Record<string, T> = Object.create(null);
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(map, parsed);
        }
    } catch {
        // missing or broken: an empty map
    }
    return map;
};
