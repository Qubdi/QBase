import type net from 'node:net';

/**
 * The most one introspection connection may receive, in bytes. A real catalog
 * is a few megabytes at the very most; a hostile database server can send
 * without end, and the drivers keep everything they read in memory.
 */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
    constructor(limit: number) {
        super(
            `The database sent more than ${Math.round(limit / (1024 * 1024))} MB of metadata; the connection was closed.`
        );
        this.name = 'ResponseTooLargeError';
    }
}

/**
 * Counts what a socket receives and destroys it, with a ResponseTooLargeError,
 * once the total passes `limit`. The count is of raw bytes on the wire, so it
 * holds however the data is framed (many rows, one huge row, TLS records).
 * Call before the driver attaches its own listeners.
 */
export function limitReceivedBytes<T extends net.Socket>(
    socket: T,
    limit: number = MAX_RESPONSE_BYTES
): T {
    let received = 0;
    socket.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > limit && !socket.destroyed) {
            socket.destroy(new ResponseTooLargeError(limit));
        }
    });
    return socket;
}
