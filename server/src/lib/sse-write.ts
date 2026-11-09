/** How much unsent text a viewer's stream may hold before it is cut off. */
export const MAX_SSE_BUFFER_BYTES = 256 * 1024;

interface Writable {
    write(chunk: string): boolean;
    readonly writableLength: number;
}

/**
 * A write function for one live stream. A viewer that reads slower than events
 * arrive makes `write` buffer in memory without end; once more than `max`
 * bytes wait unsent the stream is closed instead (the browser reconnects).
 */
export function createSseWriter(raw: Writable, close: () => void, max = MAX_SSE_BUFFER_BYTES) {
    return (chunk: string): void => {
        if (!raw.write(chunk) && raw.writableLength > max) close();
    };
}
