import { describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { redactShareToken } from '../src/app.js';

describe('request log', () => {
    it('hides a share token wherever the share path appears', () => {
        expect(redactShareToken('/s/abc123')).toBe('/s/[redacted]');
        expect(redactShareToken('/s/abc123/events')).toBe('/s/[redacted]/events');
        expect(redactShareToken('/s/abc123?x=1')).toBe('/s/[redacted]?x=1');
    });

    it('leaves every other path alone', () => {
        for (const url of ['/health', '/diagrams/1/share-links', '/auth/me', '/s', '/s/', '/stats/s/abc']) {
            expect(redactShareToken(url), url).toBe(url);
        }
    });

    it('keeps the token out of a Fastify log line', async () => {
        const lines: string[] = [];
        const stream = new Writable({
            write(chunk, _enc, done) {
                lines.push(String(chunk));
                done();
            },
        });
        const app = Fastify({
            logger: {
                level: 'info',
                stream,
                serializers: {
                    req: (req) => ({ method: req.method, url: redactShareToken(req.url ?? '') }),
                },
            },
        });
        app.get('/s/:token', async () => ({ ok: true }));
        await app.inject({ url: '/s/SECRET-TOKEN-VALUE' });
        await app.close();
        const log = lines.join('');
        expect(log).toContain('/s/[redacted]');
        expect(log).not.toContain('SECRET-TOKEN-VALUE');
    });
});
