import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { savedConnections } from '../db/schema.js';
import { CryptoBox } from './crypto-box.js';
import { filterMetadata } from './filter.js';
import {
    ForbiddenTargetError,
    resolveAllowedTarget,
    type LookupAll,
} from './net-guard.js';
import { connectPostgres } from './postgres.js';
import { UnsafeSqlError } from './readonly-guard.js';
import { connectSqlServer } from './sqlserver.js';
import {
    DEFAULT_PORTS,
    type ConnectionParams,
    type IntrospectorFactory,
} from './types.js';

export const defaultIntrospectorFactory: IntrospectorFactory = (
    params,
    target
) =>
    params.dialect === 'postgresql'
        ? connectPostgres(params, target)
        : connectSqlServer(params, target);

const connectionFields = z.object({
    dialect: z.enum(['postgresql', 'sqlserver']),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().min(1).max(128),
    user: z.string().min(1).max(128),
    password: z.string().max(1000),
    ssl: z.boolean().default(false),
    trustServerCertificate: z.boolean().default(false),
});

const uuid = z.string().uuid();

/** Either full credentials, or a saved connection (password optional override). */
const requestConnection = z.union([
    z.object({ connection: connectionFields }),
    z.object({
        savedConnectionId: uuid,
        password: z.string().max(1000).optional(),
    }),
]);

const introspectBody = z
    .object({
        schemas: z.array(z.string().max(200)).max(200).optional(),
        tables: z.array(z.string().max(400)).max(5000).optional(),
    })
    .and(requestConnection);

const saveBody = connectionFields.extend({
    name: z.string().trim().min(1).max(100),
});

export interface IntrospectDeps {
    db: Db;
    config: Config;
    factory?: IntrospectorFactory;
    lookup?: LookupAll;
}

const summarize = (c: typeof savedConnections.$inferSelect) => ({
    id: c.id,
    name: c.name,
    dialect: c.dialect,
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.username,
    ssl: c.ssl,
    trustServerCertificate: c.trustServerCertificate,
    createdAt: c.createdAt,
});

/** Error text for the client with the password scrubbed out, whatever the driver said. */
export const safeMessage = (err: unknown, secrets: string[]): string => {
    let msg = err instanceof Error ? err.message : 'connection failed';
    for (const s of secrets) {
        if (s) msg = msg.split(s).join('***');
    }
    return msg.slice(0, 300);
};

export const introspectRoutes =
    ({ db, config, factory = defaultIntrospectorFactory, lookup }: IntrospectDeps): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        const box = config.connectionKey
            ? new CryptoBox(config.connectionKey)
            : null;

        /** Turns the request into vetted credentials; replies and returns null on failure. */
        const resolveParams = async (
            body: z.infer<typeof requestConnection>,
            userId: string,
            reply: FastifyReply
        ): Promise<ConnectionParams | null> => {
            if ('connection' in body) {
                const c = body.connection;
                return {
                    ...c,
                    port: c.port ?? DEFAULT_PORTS[c.dialect],
                };
            }
            const [saved] = await db
                .select()
                .from(savedConnections)
                .where(
                    and(
                        eq(savedConnections.id, body.savedConnectionId),
                        eq(savedConnections.ownerId, userId)
                    )
                );
            if (!saved) {
                reply.code(404).send({ error: 'not_found' });
                return null;
            }
            let password = body.password;
            if (password === undefined) {
                if (!box) {
                    reply.code(501).send({ error: 'encryption_not_configured' });
                    return null;
                }
                password = box.decrypt(saved.passwordEnc);
            }
            return {
                dialect: saved.dialect as ConnectionParams['dialect'],
                host: saved.host,
                port: saved.port,
                database: saved.database,
                user: saved.username,
                password,
                ssl: saved.ssl,
                trustServerCertificate: saved.trustServerCertificate,
            };
        };

        /** Connects (after the SSRF check), runs `fn`, always closes. */
        const withIntrospector = async <T>(
            params: ConnectionParams,
            reply: FastifyReply,
            fn: (i: Awaited<ReturnType<IntrospectorFactory>>) => Promise<T>
        ): Promise<T | null> => {
            try {
                const target = await resolveAllowedTarget(
                    params.host,
                    config.introspectAllowHosts,
                    lookup
                );
                const intro = await factory(params, target);
                try {
                    return await fn(intro);
                } finally {
                    await intro.close();
                }
            } catch (err) {
                if (err instanceof ForbiddenTargetError) {
                    reply.code(400).send({ error: 'target_blocked', message: err.message });
                } else if (err instanceof UnsafeSqlError) {
                    reply.code(500).send({ error: 'internal_error' });
                } else {
                    reply.code(502).send({
                        error: 'connection_failed',
                        message: safeMessage(err, [params.password]),
                    });
                }
                return null;
            }
        };

        app.post('/catalog', async (req, reply) => {
            const body = requestConnection.parse(req.body);
            const params = await resolveParams(body, req.user!.id, reply);
            if (!params) return;
            const schemas = await withIntrospector(params, reply, (i) => i.catalog());
            if (!schemas) return;
            return { dialect: params.dialect, database: params.database, schemas };
        });

        app.post('/', async (req, reply) => {
            const body = introspectBody.parse(req.body);
            const params = await resolveParams(body, req.user!.id, reply);
            if (!params) return;
            const metadata = await withIntrospector(params, reply, (i) =>
                i.introspect({ schemas: body.schemas ?? [] })
            );
            if (!metadata) return;
            return {
                dialect: params.dialect,
                metadata: filterMetadata(metadata, body.tables),
            };
        });

        // --- saved connections (passwords encrypted at rest) ----------------

        app.get('/connections', async (req) => {
            const rows = await db
                .select()
                .from(savedConnections)
                .where(eq(savedConnections.ownerId, req.user!.id));
            return rows.map(summarize);
        });

        app.post('/connections', async (req, reply) => {
            const body = saveBody.parse(req.body);
            if (!box) {
                return reply.code(501).send({ error: 'encryption_not_configured' });
            }
            const dup = await db
                .select({ id: savedConnections.id })
                .from(savedConnections)
                .where(
                    and(
                        eq(savedConnections.ownerId, req.user!.id),
                        eq(savedConnections.name, body.name)
                    )
                );
            if (dup.length > 0) {
                return reply.code(409).send({ error: 'name_taken' });
            }
            const [row] = await db
                .insert(savedConnections)
                .values({
                    ownerId: req.user!.id,
                    name: body.name,
                    dialect: body.dialect,
                    host: body.host,
                    port: body.port ?? DEFAULT_PORTS[body.dialect],
                    database: body.database,
                    username: body.user,
                    passwordEnc: box.encrypt(body.password),
                    ssl: body.ssl,
                    trustServerCertificate: body.trustServerCertificate,
                })
                .returning();
            return reply.code(201).send(summarize(row));
        });

        app.delete('/connections/:id', async (req, reply) => {
            const { id } = z.object({ id: uuid }).parse(req.params);
            const gone = await db
                .delete(savedConnections)
                .where(
                    and(
                        eq(savedConnections.id, id),
                        eq(savedConnections.ownerId, req.user!.id)
                    )
                )
                .returning({ id: savedConnections.id });
            if (gone.length === 0) {
                return reply.code(404).send({ error: 'not_found' });
            }
            return reply.code(204).send();
        });
    };
