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
import {
    introspectRoutes,
    type IntrospectDeps,
} from './introspect/routes.js';
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
            config.logLevel === 'silent' ? false : { level: config.logLevel },
        // small by default; the routes that carry a whole diagram raise it
        bodyLimit: config.bodyLimit,
        routerOptions: { maxParamLength: 1000 },
    });

    app.register(cookie, { secret: config.sessionSecret });
    app.register(rateLimit, { global: false });
    app.decorateRequest('user', null);

    // The API returns JSON, never a page: forbid framing and sniffing, and
    // let a browser that does render a response run nothing from it.
    app.addHook('onSend', async (_req, reply) => {
        reply.header('x-content-type-options', 'nosniff');
        reply.header('x-frame-options', 'DENY');
        reply.header('referrer-policy', 'no-referrer');
        reply.header(
            'content-security-policy',
            "default-src 'none'; frame-ancestors 'none'"
        );
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
            reply.header('vary', 'origin');
            if (req.method === 'OPTIONS') {
                return reply.code(204).send();
            }
        }
    });

    app.addHook('preHandler', async (req) => {
        req.user = await getSessionUser(db, req.cookies[SESSION_COOKIE]);
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
        return reply
            .code(status)
            .send({
                // a server-side failure (500, 502, 503...) may carry driver or
                // host details in its message: none of it goes to the client
                error:
                    status >= 500
                        ? 'internal_error'
                        : (err as Error).message,
            });
    });

    app.get('/health', async () => ({ ok: true }));

    app.register(authRoutes(db, config), { prefix: '/auth' });
    app.register(adminRoutes(db), { prefix: '/admin' });
    app.register(projectRoutes(db), { prefix: '/projects' });
    app.register(diagramRoutes(db, config), { prefix: '/diagrams' });
    app.register(memberRoutes(db), { prefix: '/diagrams' });
    // introspection and manual drift checks draw from one allowance per user
    const outboundLimit = sharedUserLimit(config.outboundRateLimit);
    app.register(introspectRoutes({ db, config, outboundLimit, ...introspect }), {
        prefix: '/introspect',
    });
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
    app.register(shareManagementRoutes(db), { prefix: '/diagrams' });
    app.register(publicShareRoutes(db, config), { prefix: '/s' });

    return app;
}
