import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import { SESSION_COOKIE, getSessionUser } from '../auth/sessions.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { shareLinks } from '../db/schema.js';
import { CryptoBox } from '../introspect/crypto-box.js';
import { API_SECURITY_HEADERS } from '../lib/security-headers.js';
import { canWrite, getRole } from '../diagrams/permissions.js';
import { latestSnapshot } from '../diagrams/service.js';
import { emitLinkChanged, onLinkChanged, onPublish } from '../events.js';
import { activeLinkSql } from './active.js';
import { resolveLinkById, resolveToken, type ShareLinkRow } from './access.js';
import { generateToken, hashToken } from './tokens.js';

/** Most links the editor's list returns for one diagram, newest first. */
export const MAX_LISTED_LINKS = 200;

/** Most links one diagram may have open at once; revoke one to make another. */
export const MAX_ACTIVE_LINKS = 100;

/** The lock creating a link takes, so creates for one diagram go one at a time. */
export const linkCreateLockKey = (diagramId: string) =>
    `share-links:${diagramId}`;

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
    (db: Db, config: Config): FastifyPluginAsync =>
    async (app) => {
        // Active links stay copyable: the token is kept encrypted while the
        // link lives and wiped when it is revoked. Without a key, tokens are
        // shown once, as before.
        const box = config.connectionKey
            ? new CryptoBox(config.connectionKey)
            : null;
        const sealed = (token: string) => box?.encrypt(token) ?? null;
        const unsealed = (l: ShareLinkRow) => {
            if (!box || !l.tokenEnc || l.revokedAt) return undefined;
            try {
                return box.decrypt(l.tokenEnc);
            } catch {
                // a changed key: the link works, only its URL cannot be shown
                return undefined;
            }
        };

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
                .orderBy(desc(shareLinks.createdAt))
                .limit(MAX_LISTED_LINKS);
            return rows.map((l) => ({ ...presentLink(l), token: unsealed(l) }));
        });

        app.post('/:id/share-links', async (req, reply) => {
            const { id } = diagramParam.parse(req.params);
            if (!(await requireWriter(id, req.user!.id, reply))) return;
            const body = createBody.parse(req.body ?? {});
            const token = generateToken();
            // the count and the insert are one step per diagram: creates that
            // arrive together queue on this lock, so none passes the cap on a
            // count another is about to change. The lock is not on the diagram
            // row, so saves are never held up by it.
            const link = await db.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${linkCreateLockKey(id)}, 0))`
                );
                const [{ open }] = await tx
                    .select({ open: count() })
                    .from(shareLinks)
                    .where(and(eq(shareLinks.diagramId, id), activeLinkSql()));
                if (open >= MAX_ACTIVE_LINKS) return null;
                const [created] = await tx
                    .insert(shareLinks)
                    .values({
                        diagramId: id,
                        tokenHash: hashToken(token),
                        tokenEnc: sealed(token),
                        access: body.access,
                        expiresAt: body.expiresAt
                            ? new Date(body.expiresAt)
                            : null,
                        live: body.live,
                        createdBy: req.user!.id,
                    })
                    .returning();
                return created;
            });
            if (!link) {
                return reply.code(409).send({ error: 'too_many_links' });
            }
            await audit(db, {
                userId: req.user!.id,
                action: 'share.create',
                diagramId: id,
                meta: { linkId: link.id, access: link.access },
            });
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
                // the UPDATE itself says who revoked it: of two racing requests
                // only one changes the row, so only one writes the audit entry
                const revoked = await db
                    .update(shareLinks)
                    .set({ revokedAt: new Date(), tokenEnc: null })
                    .where(
                        and(
                            eq(shareLinks.id, linkId),
                            isNull(shareLinks.revokedAt)
                        )
                    )
                    .returning({ id: shareLinks.id });
                if (revoked.length > 0) {
                    await audit(db, {
                        userId: req.user!.id,
                        action: 'share.revoke',
                        diagramId: id,
                        meta: {
                            linkId,
                            access: link.access,
                            madeAt: link.createdAt.toISOString(),
                        },
                    });
                }
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
                .set({ tokenHash: hashToken(token), tokenEnc: sealed(token) })
                // a revoke that landed after the check above must not be undone
                .where(and(eq(shareLinks.id, linkId), isNull(shareLinks.revokedAt)))
                .returning();
            if (!updated) return reply.code(409).send({ error: 'revoked' });
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

        // what a link shows is for whoever holds it now: never for a shared
        // cache or the browser's history (the event stream sets its own)
        app.addHook('onSend', async (_req, reply) => {
            reply.header('cache-control', 'no-store');
        });

        // open live viewers per link, so one link cannot hold unlimited sockets
        const viewers = new Map<string, number>();
        // ...and per client address over all links, so one address cannot take every slot
        const viewersByIp = new Map<string, number>();
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
            // a failed check must not be served from the cache
            result.catch(() => rechecks.delete(key));
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
            // the link is fine; nothing has been published to show yet
            if (!snap) return reply.code(404).send({ error: 'not_published' });
            return {
                title: snap.title,
                content: snap.content,
                version: snap.version,
                publishedAt: snap.publishedAt,
                live: check.link.live,
            };
        });

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
            const ip = req.ip;
            const openFromIp = viewersByIp.get(ip) ?? 0;
            if (open >= config.sseMaxPerLink || openFromIp >= config.sseMaxPerIp) {
                return reply.code(429).send({ error: 'too_many_viewers' });
            }
            viewers.set(linkId, open + 1);
            viewersByIp.set(ip, openFromIp + 1);

            reply.hijack();
            const raw = reply.raw;
            raw.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache, no-transform',
                // the stream bypasses the app's onSend hook
                ...API_SECURITY_HEADERS,
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
                const fromIp = (viewersByIp.get(ip) ?? 1) - 1;
                if (fromIp > 0) viewersByIp.set(ip, fromIp);
                else viewersByIp.delete(ip);
                cleanup.forEach((fn) => fn());
                raw.end();
            };

            // still allowed? (revoked, expired, access changed, live turned off,
            // or the token was regenerated so this URL is no longer the real one)
            const stillValid = () =>
                stillValidShared(linkId, openedWith, req.user);

            // The listeners run detached from any request, so a database error
            // in one would be an unhandled rejection and end the process. The
            // viewer's stream closes instead; the browser reconnects.
            cleanup.push(
                onPublish(async (changedDiagramId, version) => {
                    if (closed || changedDiagramId !== diagramId) return;
                    try {
                        if (!(await stillValid())) return close();
                        raw.write(
                            `event: version\ndata: ${JSON.stringify({ version })}\n\n`
                        );
                    } catch (err) {
                        req.log.error(
                            { err },
                            'share events: publish check failed'
                        );
                        close();
                    }
                })
            );
            cleanup.push(
                onLinkChanged(async (changedLinkId) => {
                    if (closed || changedLinkId !== linkId) return;
                    try {
                        if (!(await stillValid())) close();
                    } catch (err) {
                        req.log.error(
                            { err },
                            'share events: link check failed'
                        );
                        close();
                    }
                })
            );

            // A link that needs a sign-in also needs the viewer to stay signed in:
            // each ping first checks the session is still alive (an ended session
            // or a disabled account would otherwise keep reading until the next
            // publish). The check is skipped for links open to anyone.
            const heartbeat = setInterval(async () => {
                if (closed) return;
                if (check.link.access === 'signed_in' && req.user) {
                    try {
                        const still = await getSessionUser(
                            db,
                            req.cookies[SESSION_COOKIE],
                            config.sessionIdleDays * 86_400
                        );
                        if (!still || still.id !== req.user.id) return close();
                    } catch (err) {
                        req.log.error({ err }, 'share events: session check failed');
                        return close();
                    }
                }
                if (!closed) raw.write(': ping\n\n');
            }, config.sseHeartbeatSeconds * 1000);
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
