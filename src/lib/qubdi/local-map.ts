/** A JSON object kept in localStorage under `key`; `{}` when missing, broken or blocked. */
export const readJsonMap = <T>(key: string): Record<string, T> => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};
