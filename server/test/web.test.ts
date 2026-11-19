import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildApp, redactShareToken } from '../src/app.js';
import { EMPTY_STYLE_HASH, VAUL_STYLE_HASH, webContentSecurityPolicy } from '../src/web.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db/client.js';

// No database is needed: nothing here carries a session cookie.
let dir: string;
let app: FastifyInstance;

beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'qbase-web-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(
        path.join(dir, 'index.html'),
        '<!doctype html><title>editor</title><meta name="csp-nonce" content="__CSP_NONCE__" />'
    );
    writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    // what scripts/precompress-web.mjs writes beside a large file
    writeFileSync(path.join(dir, 'assets', 'big-abc123.js'), 'console.log("plain")');
    writeFileSync(
        path.join(dir, 'assets', 'big-abc123.js.br'),
        brotliCompressSync('console.log("plain")')
    );
    writeFileSync(
        path.join(dir, 'assets', 'big-abc123.js.gz'),
        gzipSync('console.log("plain")')
    );
    writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *');
    writeFileSync(path.join(dir, 'config.js'), 'window.env = { stale: true };');
    const config = {
        ...loadConfig({ DATABASE_URL: 'postgres://x', LOG_LEVEL: 'silent' }),
        webDir: dir,
    };
    app = buildApp({ config, db: { execute: async () => [] } as unknown as Db });
    await app.ready();
});

afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
});

describe('serving the editor', () => {
    it('answers the pages of the editor, share pages included, with index.html', async () => {
        for (const url of ['/', '/s/some-token', '/projects/1/diagrams/2']) {
            const res = await app.inject({ url });
            expect(res.statusCode, url).toBe(200);
            expect(res.body, url).toContain('<title>editor</title>');
            expect(res.headers['cache-control'], url).toBe('no-cache');
        }
    });

    it('serves built files, hashed ones cached for a year', async () => {
        const js = await app.inject({ url: '/assets/app-abc123.js' });
        expect(js.statusCode).toBe(200);
        expect(js.headers['cache-control']).toContain('immutable');
        const robots = await app.inject({ url: '/robots.txt' });
        expect(robots.statusCode).toBe(200);
        expect(robots.headers['cache-control']).toBe('no-cache');
    });

    it('sends the precompressed copy to a browser that takes it, the file to the rest', async () => {
        const br = await app.inject({
            url: '/assets/big-abc123.js',
            headers: { 'accept-encoding': 'br, gzip' },
        });
        expect(br.statusCode).toBe(200);
        expect(br.headers['content-encoding']).toBe('br');
        expect(br.headers['content-type']).toContain('javascript');
        expect(br.headers['cache-control']).toContain('immutable');
        expect(brotliDecompressSync(br.rawPayload).toString()).toBe('console.log("plain")');
        const gz = await app.inject({
            url: '/assets/big-abc123.js',
            headers: { 'accept-encoding': 'gzip' },
        });
        expect(gz.headers['content-encoding']).toBe('gzip');
        const plain = await app.inject({
            url: '/assets/big-abc123.js',
            headers: { 'accept-encoding': 'identity' },
        });
        expect(plain.headers['content-encoding']).toBeUndefined();
        expect(plain.body).toBe('console.log("plain")');
        // a file with no compressed copy is sent as it is
        const small = await app.inject({
            url: '/assets/app-abc123.js',
            headers: { 'accept-encoding': 'br' },
        });
        expect(small.statusCode).toBe(200);
        expect(small.body).toBe('console.log(1)');
    });

    it('answers a missing file with a 404, not with index.html', async () => {
        for (const url of ['/assets/gone-123.js', '/favicon.png', '/x.css']) {
            const res = await app.inject({ url });
            expect(res.statusCode, url).toBe(404);
            expect(res.body, url).not.toContain('<title>');
        }
    });

    it('points the editor at its own /api, whatever the build holds', async () => {
        const res = await app.inject({ url: '/config.js' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('application/javascript');
        expect(res.body).toContain('QUBDI_BACKEND_URL: "/api"');
        expect(res.body).not.toContain('stale');
    });

    it('sends the security headers on pages and files', async () => {
        for (const url of ['/', '/assets/app-abc123.js', '/config.js', '/nope.js']) {
            const res = await app.inject({ url });
            expect(res.headers['content-security-policy'], url).toContain("connect-src 'self';");
            expect(res.headers['x-frame-options'], url).toBe('DENY');
            expect(res.headers['x-content-type-options'], url).toBe('nosniff');
            expect(res.headers['referrer-policy'], url).toBe('strict-origin-when-cross-origin');
        }
    });

    it('lets only this page\'s own <style> elements in: the nonce of the header is the one in the page', async () => {
        const res = await app.inject({ url: '/' });
        const policy = String(res.headers['content-security-policy']);
        const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
        expect(nonce).toBeTruthy();
        expect(res.body).toContain(`content="${nonce}"`);
        expect(res.body).not.toContain('__CSP_NONCE__');
        // an element can carry the nonce or the vaul hash, nothing else but 'self'
        const elem = /style-src-elem ([^;]+)/.exec(policy)?.[1];
        expect(elem).toBe(`'self' 'nonce-${nonce}' '${VAUL_STYLE_HASH}' '${EMPTY_STYLE_HASH}'`);
        expect(/style-src ([^;]+)/.exec(policy)?.[1]).toBe(elem);
        // inline style="" attributes stay allowed; style elements may not be
        expect(policy).toContain("style-src-attr 'unsafe-inline'");
        expect(elem).not.toContain('unsafe-inline');
        expect(policy).not.toMatch(/style-src [^;]*unsafe-inline/);
    });

    it('gives every page load a new nonce, on every route that answers with the page', async () => {
        const seen = new Set<string>();
        for (const url of ['/', '/', '/s/some-token', '/projects/1/diagrams/2']) {
            const res = await app.inject({ url });
            const nonce = /'nonce-([^']+)'/.exec(String(res.headers['content-security-policy']))?.[1];
            expect(nonce, url).toBeTruthy();
            expect(res.body, url).toContain(`content="${nonce}"`);
            seen.add(nonce!);
        }
        expect(seen.size).toBe(4);
        // 16 random bytes, base64
        for (const n of seen) expect(Buffer.from(n, 'base64')).toHaveLength(16);
    });

    it('sends no nonce with files, which are not pages', async () => {
        for (const url of ['/assets/app-abc123.js', '/config.js', '/robots.txt']) {
            const res = await app.inject({ url });
            const policy = String(res.headers['content-security-policy']);
            expect(policy, url).not.toContain('nonce-');
            expect(policy, url).toBe(webContentSecurityPolicy());
        }
    });

    it('allows the style vaul adds by its hash, and the hash is the one of the installed vaul', () => {
        const file = path.join(__dirname, '..', '..', 'node_modules', 'vaul', 'dist', 'index.mjs');
        const source = readFileSync(file, 'utf8');
        const calls = [...source.matchAll(/__insertCSS\(("(?:[^"\\]|\\.)*")\)/g)];
        expect(calls).toHaveLength(1);
        const css = JSON.parse(calls[0][1]) as string;
        const hash = `sha256-${createHash('sha256').update(css).digest('base64')}`;
        expect(hash).toBe(VAUL_STYLE_HASH);
    });

    it('the empty-style hash is the hash of the empty string', () => {
        expect(EMPTY_STYLE_HASH).toBe(`sha256-${createHash('sha256').update('').digest('base64')}`);
    });

    it('does not serve files from outside the folder', async () => {
        writeFileSync(path.join(dir, '..', 'qbase-web-secret.txt'), 'SECRET');
        for (const url of ['/..%2fqbase-web-secret.txt', '/%2e%2e/qbase-web-secret.txt', '/../qbase-web-secret.txt']) {
            const res = await app.inject({ url });
            expect(res.body, url).not.toContain('SECRET');
        }
        rmSync(path.join(dir, '..', 'qbase-web-secret.txt'), { force: true });
    });

    it('does not answer a changing request on a page', async () => {
        const res = await app.inject({ method: 'POST', url: '/' });
        expect(res.statusCode).toBe(404);
    });
});

describe('the API beside the editor', () => {
    it('lives under /api, with the API headers and JSON errors', async () => {
        const res = await app.inject({ url: '/api/auth/setup-status' });
        expect(res.statusCode).not.toBe(404);
        expect(res.headers['content-security-policy']).toBe(
            "default-src 'none'; frame-ancestors 'none'"
        );
        const missing = await app.inject({ url: '/api/nope' });
        expect(missing.statusCode).toBe(404);
        expect(missing.headers['content-type']).toContain('application/json');
        expect(missing.body).not.toContain('<title>');
        // an unknown API path still carries the API's headers
        for (const req of [{ url: '/api/nope' }, { method: 'POST' as const, url: '/api/nope' }]) {
            const res = await app.inject(req);
            expect(res.statusCode, req.url).toBe(404);
            expect(res.headers['content-security-policy']).toBe(
                "default-src 'none'; frame-ancestors 'none'"
            );
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        }
    });

    it('sends HSTS on an editor page only over https', async () => {
        const https = await app.inject({ url: '/', headers: { 'x-forwarded-proto': 'https' } });
        const http = await app.inject({ url: '/' });
        // the app here does not trust a proxy, so the header is not believed
        expect(http.headers['strict-transport-security']).toBeUndefined();
        expect(https.headers['strict-transport-security']).toBeUndefined();
    });

    it('gives an unknown API path HSTS-ready headers and Vary: Origin', async () => {
        const res = await app.inject({ url: '/api/nope' });
        expect(res.statusCode).toBe(404);
        expect(res.headers.vary).toBe('Origin');
    });

    it('is not also at the root', async () => {
        const res = await app.inject({ url: '/auth/setup-status' });
        expect(res.body).toContain('<title>editor</title>');
    });

    it('keeps /health at the root', async () => {
        const res = await app.inject({ url: '/health' });
        expect(res.json()).toEqual({ ok: true });
    });

    it('hides a share token in the log, with or without the prefix', () => {
        expect(redactShareToken('/api/s/abc123/events')).toBe('/api/s/[redacted]/events');
        expect(redactShareToken('/s/abc123')).toBe('/s/[redacted]');
        expect(redactShareToken('/api/auth/me')).toBe('/api/auth/me');
    });
});
