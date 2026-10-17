import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { shareLinks } from '../db/schema.js';
import { canWrite, getRole } from '../diagrams/permissions.js';
import { commentsForPublishedView } from '../comments/routes.js';
import { latestSnapshot } from '../diagrams/service.js';
import {
    emitLinkChanged,
    onLinkChanged,
    onPublish,
} from '../events.js';
import { resolveLinkById, resolveToken, type ShareLinkRow } from './access.js';
import { generateToken, hashToken } from './tokens.js';

const diagramParam = z.object({ id: z.string().uuid() });
const linkParam = z.object({
    id: z.string().uuid(),
    linkId: z.string().uuid(),
});

const futureDate = z
    .string()
    .datetime()
    .refine((s) => new Date(s).getTime() > Date.now(), {
        message: 'expiresAt must be in the future',
    });

const createBody = z
    .object({
        access: z.enum(['anyone', 'signed_in', 'off']).default('anyone'),
        expiresAt: futureDate.nullable().optional(),
        live: z.boolean().default(false),
    })
    .default({ access: 'anyone', live: false });

const patchBody = z
    .object({
        access: z.enum(['anyone', 'signed_in', 'off']).optional(),
        expiresAt: futureDate.nullable().optional(),
        live: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'nothing to update' });

const presentLink = (l: ShareLinkRow) => ({
    id: l.id,
    diagramId: l.diagramId,
    access: l.access,
    expiresAt: l.expiresAt,
    live: l.live,
    createdAt: l.createdAt,
    revokedAt: l.revokedAt,
});

/** Editor-facing management of a diagram's share links. */
export const shareManagementRoutes =
    (db: Db): FastifyPluginAsync =>
    async (app) => {
        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        // Resolves the role and enforces owner/editor, or replies 404/403.
        const requireWriter = async (
            diagramId: string,
            userId: string,
            reply: import('fastify').FastifyReply
        ) => {
            const role = await getRole(db, diagramId, userId);
            if (!role) {
                reply.code(404).send({ error: 'not_found' });
                return false;
            }
            if (!canWrite(role)) {
                reply.code(403).send({ error: 'forbidden' });
                return false;
            }
            return true;
        };

        const findLink = async (diagramId: string, linkId: string) => {
            const [link] = await db
                .select()
                .from(shareLinks)
                .where(
                    and(
                        eq(shareLinks.id, linkId),
                        eq(shareLinks.diagramId, diagramId)
                    )
                );
            return link;
        };

        app.get('/:id/share-links', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const rows = await db
                .select()
                .from(shareLinks)
                .where(eq(shareLinks.diagramId, id))
                .orderBy(desc(shareLinks.createdAt));
            return rows.map(presentLink);
        });

        app.post('/:id/share-links', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const body = createBody.parse(req.body ?? {});
            const token = generateToken();
            const [link] = await db
                .insert(shareLinks)
                .values({
                    diagramId: id,
                    tokenHash: hashToken(token),
                    access: body.access,
                    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
                    live: body.live,
                    createdBy: req.user!.id,
                })
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'share.create',
                diagramId: id,
                meta: { linkId: link.id, access: link.access },
            });
            // the raw token is returned exactly once
            return reply.code(201).send({ ...presentLink(link), token });
        });

        app.patch('/:id/share-links/:linkId', async (req, reply) => {
            const { id, linkId } = linkParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const link = await findLink(id, linkId);
            if (!link) return reply.code(404).send({ error: 'not_found' });
            const body = patchBody.parse(req.body);
            const [updated] = await db
                .update(shareLinks)
                .set({
                    access: body.access,
                    live: body.live,
                    expiresAt:
                        body.expiresAt === undefined
                            ? undefined
                            : body.expiresAt === null
                              ? null
                              : new Date(body.expiresAt),
                })
                .where(eq(shareLinks.id, linkId))
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'share.update',
                diagramId: id,
                meta: { linkId, access: updated.access },
            });
            emitLinkChanged(linkId);
            return presentLink(updated);
        });

        app.delete('/:id/share-links/:linkId', async (req, reply) => {
            const { id, linkId } = linkParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const link = await findLink(id, linkId);
            if (!link) return reply.code(404).send({ error: 'not_found' });
            if (!link.revokedAt) {
                await db
                    .update(shareLinks)
                    .set({ revokedAt: new Date() })
                    .where(eq(shareLinks.id, linkId));
                await audit(db, {
                    userId: req.user!.id,
                    action: 'share.revoke',
                    diagramId: id,
                    meta: { linkId },
                });
            }
            emitLinkChanged(linkId);
            return reply.code(204).send();
        });

        app.post('/:id/share-links/:linkId/regenerate', async (req, reply) => {
            const { id, linkId } = linkParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const link = await findLink(id, linkId);
            if (!link) return reply.code(404).send({ error: 'not_found' });
            if (link.revokedAt) {
                return reply.code(409).send({ error: 'revoked' });
            }
            const token = generateToken();
            const [updated] = await db
                .update(shareLinks)
                .set({ tokenHash: hashToken(token) })
                .where(eq(shareLinks.id, linkId))
                .returning();
            await audit(db, {
                userId: req.user!.id,
                action: 'share.regenerate',
                diagramId: id,
                meta: { linkId },
            });
            // viewers on the old URL are cut off; the old token no longer resolves
            emitLinkChanged(linkId);
            return { ...presentLink(updated), token };
        });
    };

/** Public, token-based, read-only access. Never exposes the working copy. */
export const publicShareRoutes =
    (db: Db, config: Config): FastifyPluginAsync =>
    async (app) => {
        const limit = {
            config: {
                rateLimit: {
                    max: config.shareRateLimit,
                    timeWindow: '1 minute',
                },
            },
        };
        const tokenParam = z.object({ token: z.string() });

        // open live viewers per link, so one link cannot hold unlimited sockets
        const viewers = new Map<string, number>();
        // One publish wakes every viewer of a link. They share one re-check
        // of the link instead of running a query each.
        const RECHECK_TTL_MS = 2_000;
        const rechecks = new Map<
            string,
            { at: number; result: Promise<boolean> }
        >();
        const stillValidShared = (
            linkId: string,
            openedWith: string,
            user: Parameters<typeof resolveLinkById>[2]
        ) => {
            const key = `${linkId}:${openedWith}:${user?.id ?? ''}`;
            const hit = rechecks.get(key);
            if (hit && Date.now() - hit.at < RECHECK_TTL_MS) return hit.result;
            const result = resolveLinkById(db, linkId, user).then(
                (c) => c.ok && c.link.live && c.link.tokenHash === openedWith
            );
            rechecks.set(key, { at: Date.now(), result });
            // forget old entries so the map stays small
            for (const [k, v] of rechecks) {
                if (Date.now() - v.at > RECHECK_TTL_MS) rechecks.delete(k);
            }
            return result;
        };

        app.get('/:token', limit, async (req, reply) => {
            const { token } = tokenParam.parse(req.params);
            const check = await resolveToken(db, token, req.user);
            if (!check.ok) {
                return check.reason === 'login_required'
                    ? reply.code(401).send({ error: 'login_required' })
                    : reply.code(404).send({ error: 'not_found' });
            }
            const snap = await latestSnapshot(db, check.link.diagramId);
            if (!snap) return reply.code(404).send({ error: 'not_found' });
            return {
                title: snap.title,
                content: snap.content,
                version: snap.version,
                publishedAt: snap.publishedAt,
                live: check.link.live,
            };
        });

        app.get('/:token/comments', limit, async (req, reply) => {
            const { token } = tokenParam.parse(req.params);
            const check = await resolveToken(db, token, req.user);
            if (!check.ok) {
                return check.reason === 'login_required'
                    ? reply.code(401).send({ error: 'login_required' })
                    : reply.code(404).send({ error: 'not_found' });
            }
            const view = await commentsForPublishedView(
                db,
                check.link.diagramId
            );
            if (view.version === null) {
                return reply.code(404).send({ error: 'not_found' });
            }
            return { version: view.version, comments: view.comments };
        });

        // Share links are read-only: any write attempt on comments is refused.
        for (const url of [
            '/:token/comments',
            '/:token/comments/:commentId',
            '/:token/comments/:commentId/resolve',
        ]) {
            app.route({
                method: ['POST', 'PUT', 'PATCH', 'DELETE'],
                url,
                ...limit,
                handler: async (req, reply) => {
                    const { token } = tokenParam.parse(req.params);
                    const check = await resolveToken(db, token, req.user);
                    if (!check.ok) {
                        return check.reason === 'login_required'
                            ? reply.code(401).send({ error: 'login_required' })
                            : reply.code(404).send({ error: 'not_found' });
                    }
                    return reply.code(403).send({ error: 'read_only' });
                },
            });
        }

        app.get('/:token/events', limit, async (req, reply) => {
            const { token } = tokenParam.parse(req.params);
            const check = await resolveToken(db, token, req.user);
            if (!check.ok) {
                return check.reason === 'login_required'
                    ? reply.code(401).send({ error: 'login_required' })
                    : reply.code(404).send({ error: 'not_found' });
            }
            if (!check.link.live) {
                return reply.code(404).send({ error: 'not_found' });
            }
            const { id: linkId, diagramId, tokenHash: openedWith } = check.link;

            const open = viewers.get(linkId) ?? 0;
            if (open >= config.sseMaxPerLink) {
                return reply.code(429).send({ error: 'too_many_viewers' });
            }
            viewers.set(linkId, open + 1);

            reply.hijack();
            const raw = reply.raw;
            raw.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
                ...(config.corsOrigin
                    ? {
                          'access-control-allow-origin': config.corsOrigin,
                          'access-control-allow-credentials': 'true',
                      }
                    : {}),
            });
            raw.write(': connected\n\n');

            let closed = false;
            const cleanup: Array<() => void> = [];
            const close = () => {
                if (closed) return;
                closed = true;
                const left = (viewers.get(linkId) ?? 1) - 1;
                if (left > 0) viewers.set(linkId, left);
                else viewers.delete(linkId);
                cleanup.forEach((fn) => fn());
                raw.end();
            };

            // still allowed? (revoked, expired, access changed, live turned off,
            // or the token was regenerated so this URL is no longer the real one)
            const stillValid = () =>
                stillValidShared(linkId, openedWith, req.user);

            cleanup.push(
                onPublish(async (changedDiagramId, version) => {
                    if (closed || changedDiagramId !== diagramId) return;
                    if (!(await stillValid())) return close();
                    raw.write(
                        `event: version\ndata: ${JSON.stringify({ version })}\n\n`
                    );
                })
            );
            cleanup.push(
                onLinkChanged(async (changedLinkId) => {
                    if (closed || changedLinkId !== linkId) return;
                    if (!(await stillValid())) close();
                })
            );

            const heartbeat = setInterval(() => {
                if (!closed) raw.write(': ping\n\n');
            }, 25_000);
            cleanup.push(() => clearInterval(heartbeat));

            if (check.link.expiresAt) {
                const ms = check.link.expiresAt.getTime() - Date.now();
                // setTimeout overflows past ~24.8 days; the next publish re-checks anyway
                if (ms > 0 && ms < 2 ** 31 - 1) {
                    const t = setTimeout(close, ms);
                    cleanup.push(() => clearTimeout(t));
                }
            }

            req.raw.on('close', close);
        });
    };
