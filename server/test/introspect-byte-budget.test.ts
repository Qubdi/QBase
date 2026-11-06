import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { limitReceivedBytes, MAX_RESPONSE_BYTES, ResponseTooLargeError } from '../src/introspect/byte-budget.js';
import { connectPostgres } from '../src/introspect/postgres.js';

const servers: net.Server[] = [];
const sockets: net.Socket[] = [];
afterEach(() => {
    sockets.splice(0).forEach((s) => s.destroy());
    servers.splice(0).forEach((s) => s.close());
});
const listen = async (onConnection: (s: net.Socket) => void) => {
    const server = net.createServer((s) => {
        sockets.push(s);
        s.on('error', () => undefined);
        onConnection(s);
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return (server.address() as AddressInfo).port;
};

// PostgreSQL protocol pieces
const authOk = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]);
const readyForQuery = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]);
const parameterStatus = (name: string, value: string) => {
    const body = Buffer.from(`${name}\0${value}\0`);
    const head = Buffer.alloc(5);
    head[0] = 0x53;
    head.writeInt32BE(body.length + 4, 1);
    return Buffer.concat([head, body]);
};

const params = {
    dialect: 'postgresql' as const,
    host: '127.0.0.1',
    port: 0,
    database: 'x',
    user: 'u',
    password: 'p',
    ssl: false,
    trustServerCertificate: false,
};

describe('limitReceivedBytes', () => {
    it('lets everything through up to the limit and cuts the socket after it', async () => {
        const port = await listen((s) => {
            s.write(Buffer.alloc(100));
            setTimeout(() => s.write(Buffer.alloc(100)), 30);
        });
        const got: number[] = [];
        const client = limitReceivedBytes(net.connect(port, '127.0.0.1'), 150);
        sockets.push(client);
        client.on('data', (c) => got.push(c.length));
        const error = await new Promise<Error>((resolve) => client.once('error', resolve));
        expect(error).toBeInstanceOf(ResponseTooLargeError);
        expect(error.message).toMatch(/more than .* MB of metadata/);
        expect(got.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(100);
        expect(client.destroyed).toBe(true);
    });

    it('does not cut a connection that stays within the limit', async () => {
        const port = await listen((s) => s.end(Buffer.alloc(1000)));
        const client = limitReceivedBytes(net.connect(port, '127.0.0.1'), 5000);
        sockets.push(client);
        let total = 0;
        client.on('data', (c) => (total += c.length));
        await new Promise((r) => client.once('close', r));
        expect(total).toBe(1000);
    });

    it('defaults to a limit far above any real catalog', () => {
        expect(MAX_RESPONSE_BYTES).toBe(64 * 1024 * 1024);
    });
});

describe('connectPostgres response budget', () => {
    it('still connects when the server answers normally (the counter takes nothing from the driver)', async () => {
        const port = await listen((s) => {
            s.once('data', () => s.write(Buffer.concat([authOk, parameterStatus('server_version', '16.0'), readyForQuery])));
        });
        const intro = await connectPostgres({ ...params, port }, { address: '127.0.0.1', family: 4 });
        await intro.close();
    });

    it('closes the connection of a server that never stops sending', async () => {
        const port = await listen((s) => {
            s.once('data', () => {
                s.write(authOk);
                const flood = setInterval(() => {
                    if (s.destroyed) return clearInterval(flood);
                    s.write(parameterStatus('x', 'y'.repeat(2000)));
                }, 1);
                s.on('close', () => clearInterval(flood));
            });
        });
        await expect(
            connectPostgres({ ...params, port }, { address: '127.0.0.1', family: 4 }, 50_000)
        ).rejects.toThrow(/more than .* MB of metadata/);
    });
});
