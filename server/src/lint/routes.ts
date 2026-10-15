import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import type { Db } from '../db/client.js';
import { diagrams } from '../db/schema.js';
import type { Config } from '../config.js';
import { canWrite, getRole } from '../diagrams/permissions.js';
import { perUserLimit } from '../lib/rate-key.js';
import { latestSnapshot } from '../diagrams/service.js';
import {
    RULES,
    lint,
    normalizeConfig,
    summarizeFindings,
    type LintInput,
} from '../../../shared/lint.js';

const idParam = z.object({ id: z.string().uuid() });
const lintQuery = z.object({ source: z.enum(['working', 'published']).default('working') });
const configBody = z.object({ config: z.record(z.unknown()) });
const statelessBody = z.object({
    diagram: z.record(z.unknown()),
    config: z.record(z.unknown()).optional(),
});

/** Largest diagram the stateless /lint route accepts, in bytes. */
export const LINT_BODY_LIMIT = 5 * 1024 * 1024;

export const lintRoutes =
    (db: Db, config: Pick<Config, 'lintRateLimit'>): FastifyPluginAsync =>
    async (app) => {
        const limit = perUserLimit(config.lintRateLimit);

        app.addHook('preHandler', async (req, reply) => {
            if (!req.user) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        });

        /** The rules the UI can configure, with their defaults. */
        app.get('/lint/rules', async () => RULES);

        /** Lints a diagram sent in the request. Stores nothing. */
        app.post(
            '/lint',
            {
                ...limit,
                // linting runs synchronously, so the input is capped
                bodyLimit: LINT_BODY_LIMIT,
            },
            async (req) => {
            const body = statelessBody.parse(req.body);
            const config = normalizeConfig(body.config);
            const findings = lint(body.diagram as LintInput, config);
            return { findings, summary: summarizeFindings(findings) };
        });

        app.get('/diagrams/:id/lint', limit, async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const { source } = lintQuery.parse(req.query);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            // the working copy is for editors; anyone with access may lint what is published
            if (source === 'working' && !canWrite(role)) {
                return reply.code(403).send({ error: 'forbidden' });
            }
            const [d] = await db.select().from(diagrams).where(eq(diagrams.id, id));
            let content: unknown = d.content;
            if (source === 'published') {
                const snap = await latestSnapshot(db, id);
                if (!snap) return reply.code(404).send({ error: 'not_published' });
                content = snap.content;
            }
            const config = normalizeConfig(d.lintConfig);
            const findings = lint(content as LintInput, config);
            return { source, findings, summary: summarizeFindings(findings), config };
        });

        app.get('/diagrams/:id/lint-config', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            const [d] = await db.select().from(diagrams).where(eq(diagrams.id, id));
            return normalizeConfig(d.lintConfig);
        });

        app.put('/diagrams/:id/lint-config', async (req, reply) => {
            const { id } = idParam.parse(req.params);
            const role = await getRole(db, id, req.user!.id);
            if (!role) return reply.code(404).send({ error: 'not_found' });
            if (!canWrite(role)) return reply.code(403).send({ error: 'forbidden' });
            // unknown rules or values are dropped, never stored
            const config = normalizeConfig(configBody.parse(req.body).config);
            await db.update(diagrams).set({ lintConfig: config }).where(eq(diagrams.id, id));
            await audit(db, { userId: req.user!.id, action: 'lint.configure', diagramId: id });
            return config;
        });
    };
