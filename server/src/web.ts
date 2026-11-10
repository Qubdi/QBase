import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { API_SECURITY_HEADERS, hstsHeaders } from './lib/security-headers.js';

/** Where the API lives when this server also serves the editor. */
export const API_PREFIX = '/api';

/** What index.html holds where the page's style nonce goes (see sendIndex). */
export const CSP_NONCE_PLACEHOLDER = '__CSP_NONCE__';

/**
 * The one <style> that vaul (the mobile drawer) adds when it loads, which has
 * no way to carry a nonce: allowed by its hash instead. It is the SHA-256 of
 * the CSS text in node_modules/vaul/dist/index.mjs; web.test.ts recomputes it,
 * so a vaul upgrade that changes the text fails there until this is updated.
 */
export const VAUL_STYLE_HASH = 'sha256-YIjArHm2rkb5J7hX9lUM1bnQ3Kp61MTfluMGkuyKwDw=';

/**
 * The policy of an editor page. Styles: a <style> element needs this page's
 * nonce (or the vaul hash above), so an injected <style> does nothing. A
 * style="" attribute stays allowed (style-src-attr): React and the canvas set
 * positions and sizes that way, and an attribute can restyle but not run code
 * or read the page. The editor talks to this same origin, so connect-src is
 * 'self'. Without a nonce (files, errors) only 'self' and the hash apply.
 */
export const webContentSecurityPolicy = (nonce?: string): string => {
    const elem = ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : []), `'${VAUL_STYLE_HASH}'`].join(' ');
    return [
        "default-src 'self'",
        "script-src 'self'",
        `style-src ${elem}`,
        `style-src-elem ${elem}`,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; ');
};

/** Headers on every page and file of the editor (the API sets its own, stricter ones). */
export const WEB_SECURITY_HEADERS = {
    'content-security-policy': webContentSecurityPolicy(),
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
export function registerWeb(
    app: FastifyInstance,
    root: string,
    cookieSecure: boolean | 'auto' = 'auto'
): void {
    // index.html is read on each request: the nonce in it is new every time
    const indexFile = path.join(path.resolve(root), 'index.html');
    const sendIndex = async (reply: FastifyReply) => {
        const nonce = randomBytes(16).toString('base64');
        const html = (await readFile(indexFile, 'utf8')).replaceAll(
            CSP_NONCE_PLACEHOLDER,
            nonce
        );
        return reply
            .type('text/html; charset=utf-8')
            .header('cache-control', 'no-cache')
            .header('content-security-policy', webContentSecurityPolicy(nonce))
            .send(html);
    };

    app.addHook('onSend', async (req, reply) => {
        if (isApiPath(req.url)) return;
        const { 'content-security-policy': policy, ...others } = WEB_SECURITY_HEADERS;
        // a page already carries its own policy, with its nonce
        reply.headers(reply.hasHeader('content-security-policy') ? others : { ...others, 'content-security-policy': policy });
        reply.headers(hstsHeaders(req, cookieSecure));
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
    app.get('/', async (_req, reply) => sendIndex(reply));

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
        return sendIndex(reply);
    });
}
