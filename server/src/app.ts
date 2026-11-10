import { API_SECURITY_HEADERS, hstsHeaders } from './lib/security-headers.js';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { authRoutes } from './auth/routes.js';
import {
    getSessionUser,
    sessionTokenOf,
    type SessionUser,
} from './auth/sessions.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { driftRoutes } from './drift/routes.js';
import { defaultIntrospectorFactory } from './introspect/routes.js';
import { lintRoutes } from './lint/routes.js';
import { introspectRoutes, type IntrospectDeps } from './introspect/routes.js';
import { adminRoutes } from './admin/routes.js';
import { diagramRoutes } from './diagrams/routes.js';
import { projectRoutes } from './projects/routes.js';
import { memberRoutes } from './members/routes.js';
import { sharedUserLimit } from './lib/rate-key.js';
import { registerWeb, API_PREFIX } from './web.js';
import { publicShareRoutes, shareManagementRoutes } from './share/routes.js';

declare module 'fastify' {
    interface FastifyRequest {
        user: SessionUser | null;
    }
}

export interface AppDeps {
    config: Config;
    db: Db;
    /** test seams for the introspection endpoints */
    introspect?: Pick<IntrospectDeps, 'factory' | 'lookup'>;
    /** calls a minute one signed-in user may make in all (tests lower or raise it) */
    userRateLimit?: number;
}

/**
 * Calls a minute one signed-in user may make across the whole API. It is far
 * above what the editor does (saves are debounced) and only stops a script
 * from sending the heavy routes (saves, shares, admin) without end; routes
 * with a tighter limit of their own keep it.
 */
export const USER_RATE_LIMIT = 600;

/** Trust the nearest `hops` proxies (Fastify's types only take a function here). */
const trustHops = (hops: number) => (_address: string, hop: number) =>
    hop < hops;

/** What a session on a temporary password may still call (the sign-in routes need no session). */
export const OPEN_TO_TEMPORARY_PASSWORD: ReadonlySet<string> = new Set([
    '/health',
    '/auth/me',
    '/auth/change-password',
    '/auth/logout',
    '/auth/login',
    '/auth/login/mfa',
    '/auth/register',
    '/auth/setup-status',
]);

/**
 * Public share pages (`/s/<token>`, `/s/<token>/events`) show a published copy,
 * not the account's own data: someone on a temporary password may open a link
 * that was sent to them.
 */
export const isOpenToTemporaryPassword = (path: string): boolean =>
    OPEN_TO_TEMPORARY_PASSWORD.has(path) || path.startsWith('/s/');

/**
 * A share link's token is the credential for it, and it sits in the URL
 * (`/s/<token>`, `/s/<token>/events`): the request log must not keep it.
 */
export function redactShareToken(url: string): string {
    return url.replace(/^((?:\/api)?\/s\/)[^/?#]+/, '$1[redacted]');
}

/** how long /health waits for the database before it says no */
const HEALTH_DB_TIMEOUT_MS = 2000;

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The host (with port) an Origin header names; null for the opaque `null` origin or junk. */
function hostOf(origin: string): string | null {
    try {
        return new URL(origin).host;
    } catch {
        return null;
    }
}

// receiving one whole request, up to a 50 MB body, must finish within this
export const REQUEST_TIMEOUT_MS = 120_000;
// an idle socket is closed after this; SSE heartbeats (25 s by default) keep a live stream busy
export const CONNECTION_TIMEOUT_MS = 120_000;

export function buildApp({
    config,
    db,
    introspect,
    userRateLimit = USER_RATE_LIMIT,
}: AppDeps): FastifyInstance {
    const prefix = config.webDir ? API_PREFIX : '';
    const app = Fastify({
        // closing the server drops idle connections only: a request being answered
        // finishes first (the open SSE streams are ended by the share routes' own
        // preClose hook), and the shutdown's own timer is the limit on waiting
        forceCloseConnections: 'idle',
        // a client that trickles its request in is cut off instead of holding a socket open;
        // the timeouts cover receiving the request, so a live SSE stream is not affected
        requestTimeout: REQUEST_TIMEOUT_MS,
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        // behind a reverse proxy req.ip is the proxy's, unless it is trusted
        trustProxy:
            typeof config.trustProxy === 'number'
                ? trustHops(config.trustProxy)
                : config.trustProxy,
        logger:
            config.logLevel === 'silent'
                ? false
                : {
                      level: config.logLevel,
                      serializers: {
                          // Fastify's usual request fields, with the token hidden
                          req(req) {
                              return {
                                  method: req.method,
                                  url: redactShareToken(req.url ?? ''),
                                  version: req.headers['accept-version'] as string | undefined,
                                  host: req.host,
                                  remoteAddress: req.ip,
                                  remotePort: req.socket?.remotePort,
                              };
                          },
                      },
                  },
        // small by default; the routes that carry a whole diagram raise it
        bodyLimit: config.bodyLimit,
        routerOptions: { maxParamLength: 1000 },
    });

    // answers ok only when the database does: a server that cannot reach it is
    // not healthy, whatever its own process is doing
    app.get('/health', async (_req, reply) => {
        try {
            await Promise.race([
                db.execute(sql`select 1`),
                new Promise((_resolve, reject) =>
                    setTimeout(() => reject(new Error('database timeout')), HEALTH_DB_TIMEOUT_MS).unref()
                ),
            ]);
            return { ok: true };
        } catch (err) {
            app.log.warn({ err }, 'health check: the database did not answer');
            return reply.code(503).send({ ok: false });
        }
    });

    const mountApi = (api: FastifyInstance) => {
    api.register(cookie);
    api.register(rateLimit, { global: false });
    api.decorateRequest('user', null);

    api.addHook('onSend', async (req, reply) => {
        reply.headers(API_SECURITY_HEADERS);
        reply.headers(hstsHeaders(req, config.cookieSecure));
        // answers carry sessions, tokens and diagrams: no cache keeps a copy
        // (a route that sets its own cache-control, like the event stream, keeps it)
        if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    });

    api.addHook('onRequest', async (req, reply) => {
        if (config.corsOrigin) {
            reply.header('access-control-allow-origin', config.corsOrigin);
            reply.header('access-control-allow-credentials', 'true');
            reply.header(
                'access-control-allow-methods',
                'GET,POST,PUT,PATCH,DELETE,OPTIONS'
            );
            reply.header('access-control-allow-headers', 'content-type');
            // the editor reads these from the activity export
            reply.header(
                'access-control-expose-headers',
                'x-row-count,x-truncated,content-disposition'
            );
            reply.header('vary', 'origin');
            if (req.method === 'OPTIONS') {
                return reply.code(204).send();
            }
        }
    });

    // The session cookie is SameSite=Lax; this is the second line against a page
    // on another site making the browser send a changing request: one that names
    // its Origin must name this API's own editor (CORS_ORIGIN) or, with none set,
    // this host (as a trusted proxy reports it). Requests with no Origin (scripts,
    // curl) are not a browser's doing.
    api.addHook('onRequest', async (req, reply) => {
        if (!MUTATING_METHODS.has(req.method)) return;
        const origin = req.headers.origin;
        if (origin === undefined) return;
        const allowed = config.corsOrigin
            ? origin === config.corsOrigin
            : hostOf(origin) === req.host;
        if (!allowed) return reply.code(403).send({ error: 'bad_origin' });
    });

    api.addHook('preHandler', async (req) => {
        req.user = await getSessionUser(
            db,
            sessionTokenOf(req.cookies),
            config.sessionIdleDays * 86_400
        );
    });

    // Every signed-in call draws on one allowance per user. Counting waits for
    // the session lookup above, so only a real user is counted (a made-up
    // cookie adds nothing); the routes open to anyone have limits of their own.
    const userLimit = sharedUserLimit(userRateLimit);
    api.addHook('preHandler', async (req, reply) => {
        if (!req.user) return;
        return userLimit(req, reply);
    });

    // someone on a temporary password may only change it, ask who they are, or
    // sign out; everything else waits until they have chosen their own
    api.addHook('preHandler', async (req, reply) => {
        if (!req.user?.mustChangePassword) return;
        const path = req.url.split('?')[0].slice(prefix.length);
        if (isOpenToTemporaryPassword(path)) return;
        return reply.code(403).send({ error: 'password_change_required' });
    });

    api.setErrorHandler((err, req, reply) => {
        if (err instanceof ZodError) {
            return reply
                .code(400)
                .send({ error: 'invalid_request', issues: err.issues });
        }
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        // unexpected failures: log them with the request id, show the client nothing
        if (status >= 500) req.log.error({ err }, 'request failed');
        return reply.code(status).send({
            // a server-side failure (500, 502, 503...) may carry driver or
            // host details in its message: none of it goes to the client
            error: status >= 500 ? 'internal_error' : (err as Error).message,
        });
    });

    api.register(authRoutes(db, config), { prefix: '/auth' });
    api.register(adminRoutes(db, config), { prefix: '/admin' });
    api.register(projectRoutes(db), { prefix: '/projects' });
    api.register(diagramRoutes(db, config), { prefix: '/diagrams' });
    api.register(memberRoutes(db), { prefix: '/diagrams' });
    // introspection and manual drift checks draw from one allowance per user
    const outboundLimit = sharedUserLimit(config.outboundRateLimit);
    api.register(
        introspectRoutes({ db, config, outboundLimit, ...introspect }),
        {
            prefix: '/introspect',
        }
    );
    api.register(
        driftRoutes({
            db,
            config,
            factory: introspect?.factory ?? defaultIntrospectorFactory,
            lookup: introspect?.lookup,
            outboundLimit,
        }),
        { prefix: '/diagrams' }
    );
    api.register(lintRoutes(db, config));
    api.register(shareManagementRoutes(db, config), { prefix: '/diagrams' });
    api.register(publicShareRoutes(db, config), { prefix: '/s' });

    };

    if (config.webDir) {
        // The API lives under /api when this server also serves the editor (a share
        // link's page, /s/<token>, is the editor's own route); the hooks and error
        // handler stay inside that prefix so the pages do not get them.
        app.register(async (api) => mountApi(api), { prefix });
        registerWeb(app, config.webDir, config.cookieSecure);
    } else {
        // on its own, the API is the whole server, at the root
        mountApi(app);
    }

    return app;
}
