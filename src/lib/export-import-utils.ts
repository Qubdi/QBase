/** The biggest diagram file the editor reads, the same as the server's save limit. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Reads a chosen file as text; works for any `Blob`, also where `Blob.text` is missing. */
export function readFileText(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsText(file);
    });
}
