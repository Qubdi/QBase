import type { FastifyReply, FastifyRequest } from 'fastify';
import { API_SECURITY_HEADERS, hstsHeaders } from './security-headers.js';

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

/**
 * Take over the reply and open an event stream on it: the head (the stream
 * bypasses the app's onSend hook, so it carries the security and CORS headers
 * itself) and the first comment line. Returns the raw response to write to.
 */
export function openEventStream(
    req: FastifyRequest,
    reply: FastifyReply,
    config: { corsOrigin: string | null; cookieSecure: boolean | 'auto' }
) {
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        // nginx would hold events back in a buffer until it fills
        'x-accel-buffering': 'no',
        ...API_SECURITY_HEADERS,
        ...hstsHeaders(req, config.cookieSecure),
        connection: 'keep-alive',
        ...(config.corsOrigin
            ? {
                  'access-control-allow-origin': config.corsOrigin,
                  'access-control-allow-credentials': 'true',
                  vary: 'Origin',
              }
            : {}),
    });
    raw.write(': connected\n\n');
    return raw;
}
