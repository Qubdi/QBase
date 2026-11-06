import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { API_SECURITY_HEADERS } from './lib/security-headers.js';

/** Where the API lives when this server also serves the editor. */
export const API_PREFIX = '/api';

/**
 * Headers on every page and file of the editor (the API sets its own, stricter
 * ones). style-src needs 'unsafe-inline': React and the editor set inline
 * styles. The editor talks to this same origin, so connect-src is 'self'.
 */
export const WEB_SECURITY_HEADERS = {
    'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
} as const;

const CONFIG_JS = `window.env = { QUBDI_BACKEND_URL: "${API_PREFIX}" };`;

const isApiPath = (url: string) =>
    url === API_PREFIX || url.startsWith(`${API_PREFIX}/`) || url.startsWith(`${API_PREFIX}?`);

/**
 * Serves the built editor from `root`: files as they are, /config.js pointing
 * the editor at this server's own API, and index.html for any other page (the
 * editor does its own routing). A missing file under /assets/ is a 404, not
 * index.html: a stale asset URL must not get HTML where a script was expected.
 */
export function registerWeb(app: FastifyInstance, root: string): void {
    app.addHook('onSend', async (req, reply) => {
        if (!isApiPath(req.url)) reply.headers(WEB_SECURITY_HEADERS);
    });

    app.get('/config.js', async (_req, reply) =>
        reply
            .type('application/javascript; charset=utf-8')
            .header('cache-control', 'no-cache')
            .send(CONFIG_JS)
    );

    app.register(fastifyStatic, {
        root: path.resolve(root),
        index: false,
        // the image build writes a .br and .gz beside each large file
        // (scripts/precompress-web.mjs): sent to browsers that take them, the
        // file itself to the rest
        preCompressed: true,
        // hashed build files never change; everything else is checked each time
        cacheControl: false,
        setHeaders(res, filePath) {
            const hashed = filePath.split(path.sep).includes('assets');
            res.header(
                'cache-control',
                hashed ? 'public, max-age=31536000, immutable' : 'no-cache'
            );
        },
    });

    // the static handler refuses a folder, and "/" is one
    app.get('/', async (_req, reply) =>
        reply.header('cache-control', 'no-cache').sendFile('index.html')
    );

    app.setNotFoundHandler(async (req, reply) => {
        const url = req.url.split('?')[0];
        const page =
            (req.method === 'GET' || req.method === 'HEAD') &&
            !isApiPath(url) &&
            !url.startsWith('/assets/') &&
            !path.extname(url);
        if (!page) {
            // an unknown API path never reaches the API's own hooks: give it
            // the API's headers here (pages and files get theirs in onSend)
            if (isApiPath(url)) reply.headers(API_SECURITY_HEADERS);
            return reply.code(404).send({
                message: `Route ${req.method}:${url} not found`,
                error: 'Not Found',
                statusCode: 404,
            });
        }
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
}
