import { API_SECURITY_HEADERS } from './lib/security-headers.js';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './auth/routes.js';
import {
    getSessionUser,
    SESSION_COOKIE,
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
}

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
 * A share link's token is the credential for it, and it sits in the URL
 * (`/s/<token>`, `/s/<token>/events`): the request log must not keep it.
 */
export function redactShareToken(url: string): string {
    return url.replace(/^\/s\/[^/?#]+/, '/s/[redacted]');
}

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The host (with port) an Origin header names; null for the opaque `null` origin or junk. */
function hostOf(origin: string): string | null {
    try {
        return new URL(origin).host;
    } catch {
        return null;
    }
}

export function buildApp({ config, db, introspect }: AppDeps): FastifyInstance {
    const app = Fastify({
        // closing the server also ends open SSE streams instead of waiting on them
        forceCloseConnections: true,
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

    app.register(cookie);
    app.register(rateLimit, { global: false });
    app.decorateRequest('user', null);

    app.addHook('onSend', async (_req, reply) => {
        reply.headers(API_SECURITY_HEADERS);
    });

    app.addHook('onRequest', async (req, reply) => {
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
    // this host. Requests with no Origin (scripts, curl) are not browsers' doing.
    app.addHook('onRequest', async (req, reply) => {
        if (!MUTATING_METHODS.has(req.method)) return;
        const origin = req.headers.origin;
        if (origin === undefined) return;
        const allowed = config.corsOrigin
            ? origin === config.corsOrigin
            : hostOf(origin) === req.headers.host;
        if (!allowed) return reply.code(403).send({ error: 'bad_origin' });
    });

    app.addHook('preHandler', async (req) => {
        req.user = await getSessionUser(
            db,
            req.cookies[SESSION_COOKIE],
            config.sessionIdleDays * 86_400
        );
    });

    // someone on a temporary password may only change it, ask who they are, or
    // sign out; everything else waits until they have chosen their own
    app.addHook('preHandler', async (req, reply) => {
        if (!req.user?.mustChangePassword) return;
        const path = req.url.split('?')[0];
        if (OPEN_TO_TEMPORARY_PASSWORD.has(path)) return;
        return reply.code(403).send({ error: 'password_change_required' });
    });

    app.setErrorHandler((err, req, reply) => {
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

    app.get('/health', async () => ({ ok: true }));

    app.register(authRoutes(db, config), { prefix: '/auth' });
    app.register(adminRoutes(db, config), { prefix: '/admin' });
    app.register(projectRoutes(db), { prefix: '/projects' });
    app.register(diagramRoutes(db, config), { prefix: '/diagrams' });
    app.register(memberRoutes(db), { prefix: '/diagrams' });
    // introspection and manual drift checks draw from one allowance per user
    const outboundLimit = sharedUserLimit(config.outboundRateLimit);
    app.register(
        introspectRoutes({ db, config, outboundLimit, ...introspect }),
        {
            prefix: '/introspect',
        }
    );
    app.register(
        driftRoutes({
            db,
            config,
            factory: introspect?.factory ?? defaultIntrospectorFactory,
            lookup: introspect?.lookup,
            outboundLimit,
        }),
        { prefix: '/diagrams' }
    );
    app.register(lintRoutes(db, config));
    app.register(shareManagementRoutes(db, config), { prefix: '/diagrams' });
    app.register(publicShareRoutes(db, config), { prefix: '/s' });

    return app;
}
