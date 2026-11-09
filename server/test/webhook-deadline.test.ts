import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseWebhookUrl, postJson } from '../src/drift/webhook.js';

const servers: http.Server[] = [];
const listen = async (handler: http.RequestListener) => {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
};
afterEach(async () => {
    for (const s of servers.splice(0)) {
        s.closeAllConnections();
        await new Promise((r) => s.close(r));
    }
});

describe('postJson deadline', () => {
    it('delivers to a normal server', async () => {
        const port = await listen((_req, res) => res.end('ok'));
        const r = await postJson(`http://127.0.0.1:${port}/h`, { a: 1 }, { allow: ['127.0.0.1'] });
        expect(r).toEqual({ ok: true, status: 200 });
    });

    it('gives up on a server that trickles its reply instead of holding the check open', async () => {
        // headers that never end, one small piece at a time: the idle timeout keeps being reset
        const port = await listen((req) => {
            const socket = req.socket;
            socket.write('HTTP/1.1 200 OK\r\n');
            const tick = setInterval(() => {
                if (socket.destroyed) return clearInterval(tick);
                socket.write('X-Slow: yes\r\n');
            }, 40);
            socket.on('close', () => clearInterval(tick));
        });
        const started = Date.now();
        const r = await postJson(
            `http://127.0.0.1:${port}/h`,
            { a: 1 },
            { allow: ['127.0.0.1'], deadlineMs: 300 }
        );
        expect(r).toEqual({ ok: false, error: 'timed out' });
        expect(Date.now() - started).toBeLessThan(2000);
    });
});

describe('webhook URL scheme', () => {
    it('takes https, and plain http only for an allow-listed host', () => {
        expect(parseWebhookUrl('https://hooks.example.com/x')).toHaveProperty('url');
        expect(parseWebhookUrl('http://hooks.example.com/x')).toHaveProperty('error');
        expect(parseWebhookUrl('http://hooks.example.com/x', ['other.example.com'])).toHaveProperty('error');
        expect(parseWebhookUrl('http://hooks.example.com/x', ['hooks.example.com'])).toHaveProperty('url');
        expect(parseWebhookUrl('http://10.1.2.3/x', ['10.0.0.0/8'])).toHaveProperty('url');
        expect(parseWebhookUrl('http://[::1]:8080/x', ['::1'])).toHaveProperty('url');
        expect(parseWebhookUrl('ftp://hooks.example.com/x', ['hooks.example.com'])).toHaveProperty('error');
    });

    it('refuses to send over http to a host the list does not name', async () => {
        const r = await postJson('http://127.0.0.1:9/h', {}, { allow: [] });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/https/);
    });
});
