import { createGunzip } from 'node:zlib';
import { pipeline, Transform, type Readable } from 'node:stream';
import type { preParsingAsyncHookHandler } from 'fastify';

/**
 * Lets a request body arrive gzipped (`Content-Encoding: gzip`). A browser
 * caps the body of a request sent as the page closes at 64 KiB, and a diagram
 * past that fits only once compressed.
 *
 * The inflated size is held to `limit`, the route's own body limit, while the
 * data is read: a small file that expands to a huge one is refused as soon as
 * it passes the limit, without being inflated further.
 */
export const gunzipBody =
    (limit: number): preParsingAsyncHookHandler =>
    async (req, reply, payload) => {
        const encoding = req.headers['content-encoding']?.trim().toLowerCase();
        if (encoding === undefined || encoding === '' || encoding === 'identity') {
            return payload;
        }
        if (encoding !== 'gzip') {
            return reply.code(415).send({ error: 'unsupported_encoding' });
        }

        let received = 0;
        const counter = new Transform({
            transform(chunk: Buffer, _enc, done) {
                received += chunk.length;
                done(null, chunk);
            },
        });
        let inflated = 0;
        const limiter = new Transform({
            transform(chunk: Buffer, _enc, done) {
                inflated += chunk.length;
                if (inflated > limit) {
                    done(
                        Object.assign(new Error('Request body is too large'), {
                            statusCode: 413,
                            code: 'FST_ERR_CTP_BODY_TOO_LARGE',
                        })
                    );
                    return;
                }
                done(null, chunk);
            },
        });
        const gunzip = createGunzip();
        // data that is not gzip is the sender's mistake, not a server error
        gunzip.once('error', (e: Error) => {
            Object.assign(e, {
                statusCode: 400,
                code: 'FST_ERR_CTP_INVALID_CONTENT',
            });
        });
        pipeline(payload as Readable, counter, gunzip, limiter, () => {
            // an error destroys `limiter`, which hands it on to whoever reads the body
        });
        // the body is checked against Content-Length as the bytes that were sent,
        // not as the bytes that came out
        Object.defineProperty(limiter, 'receivedEncodedLength', {
            get: () => received,
        });
        return limiter;
    };
