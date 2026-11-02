import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { connectSqlServer } from '../src/introspect/sqlserver.js';
import type { ConnectionParams } from '../src/introspect/types.js';

// A SQL Server may answer a login with "connect to this host and port
// instead" (Azure does, for its gateways). The client follows it on its own,
// so a hostile server could aim it at an internal address the net guard never
// saw. This fake server answers the login that way.

const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    return b;
};
const packet = (payload: Buffer) => {
    const head = Buffer.alloc(8);
    head[0] = 4; // tabular result
    head[1] = 1; // last packet of the message
    head.writeUInt16BE(8 + payload.length, 2);
    head[6] = 1;
    return Buffer.concat([head, payload]);
};
// version and "encryption not supported"
const preloginReply = () =>
    Buffer.from([0, 0, 11, 0, 6, 1, 0, 17, 0, 1, 0xff, 0x10, 0, 0, 0, 0, 0, 2]);
// "logged in": interface T-SQL, TDS 7.4, a program name and a version
const loginAck = () => {
    const version = Buffer.alloc(4);
    version.writeUInt32BE(0x74000004);
    const body = Buffer.concat([
        Buffer.from([1]),
        version,
        Buffer.from([1]),
        Buffer.from('x', 'ucs2'),
        Buffer.from([16, 0, 0, 0]),
    ]);
    return Buffer.concat([Buffer.from([0xad]), u16(body.length), body]);
};
const redirectReply = (host: string, port: number) => {
    const route = Buffer.concat([
        Buffer.from([0]),
        u16(port),
        u16(host.length),
        Buffer.from(host, 'ucs2'),
    ]);
    const change = Buffer.concat([
        Buffer.from([20]),
        u16(route.length),
        route,
        u16(0),
    ]);
    const envChange = Buffer.concat([
        Buffer.from([0xe3]),
        u16(change.length),
        change,
    ]);
    const done = Buffer.concat([
        Buffer.from([0xfd]),
        u16(0),
        u16(0),
        Buffer.alloc(8),
    ]);
    return Buffer.concat([loginAck(), envChange, done]);
};

describe('a SQL Server that redirects the login', () => {
    const servers: net.Server[] = [];
    afterEach(() => servers.splice(0).forEach((s) => s.close()));

    /** Listens on every loopback address and notes where each client came to. */
    const listen = async (onData?: (s: net.Socket, d: Buffer) => void) => {
        const reached: string[] = [];
        const server = net.createServer((socket) => {
            reached.push(socket.localAddress ?? '');
            socket.on('error', () => undefined);
            if (onData) socket.on('data', (d) => onData(socket, d));
        });
        servers.push(server);
        await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
        return { port: (server.address() as net.AddressInfo).port, reached };
    };

    const params = (port: number): ConnectionParams => ({
        dialect: 'sqlserver',
        host: '127.0.0.1',
        port,
        database: 'master',
        user: 'sa',
        password: 'x',
        ssl: false,
        trustServerCertificate: true,
    });
    const target = { address: '127.0.0.1', family: 4 as const };

    const gateway = (redirect: () => { host: string; port: number }) =>
        listen((socket, data) => {
            if (data[0] === 0x12) socket.write(packet(preloginReply()));
            else if (data[0] === 0x10) {
                const to = redirect();
                socket.write(packet(redirectReply(to.host, to.port)));
            }
        });

    it('is not followed to another port', async () => {
        const internal = await listen();
        const server = await gateway(() => ({
            host: '127.0.0.1',
            port: internal.port,
        }));

        await expect(
            connectSqlServer(params(server.port), target)
        ).rejects.toThrow(/which is not allowed/);
        await new Promise((r) => setTimeout(r, 100));
        expect(internal.reached).toEqual([]);
        expect(server.reached).toEqual(['127.0.0.1']);
    });

    it('is not followed to another host', async () => {
        let port = 0;
        const server = await gateway(() => ({ host: '127.0.0.2', port }));
        port = server.port;

        await expect(
            connectSqlServer(params(server.port), target)
        ).rejects.toThrow(/which is not allowed/);
        await new Promise((r) => setTimeout(r, 100));
        // only ever the vetted 127.0.0.1, never a second connection to 127.0.0.2
        expect(server.reached).toEqual(['127.0.0.1']);
    });
});
