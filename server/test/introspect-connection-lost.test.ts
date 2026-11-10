import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionLostError, watchConnection } from '../src/introspect/connection-watch.js';
import { PostgresIntrospector } from '../src/introspect/postgres.js';
import { SqlServerIntrospector } from '../src/introspect/sqlserver.js';

/** What a driver connection does when the target drops it: it emits 'error' on itself. */
const dropped = (source: EventEmitter, message = 'Connection terminated unexpectedly') => {
    // an 'error' with no listener throws: this is what would end the process
    source.emit('error', new Error(message));
};

describe('a dropped introspection connection', () => {
    it('does not throw out of the emitter once watched, and marks the connection dead', () => {
        const source = new EventEmitter();
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const watch = watchConnection(source, 'hunter2');
            expect(watch.isLost()).toBe(false);
            watch.assertAlive();
            expect(() => dropped(source)).not.toThrow();
            expect(watch.isLost()).toBe(true);
            expect(() => watch.assertAlive()).toThrow(ConnectionLostError);
        } finally {
            log.mockRestore();
        }
    });

    it('would crash without the listener (the failure this guards against)', () => {
        expect(() => dropped(new EventEmitter())).toThrow('Connection terminated unexpectedly');
    });

    it('logs the reason with the password scrubbed out', () => {
        const source = new EventEmitter();
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            watchConnection(source, 'hunter2');
            dropped(source, 'password authentication failed for hunter2 at host');
            const text = log.mock.calls.map((c) => c.join(' ')).join('\n');
            expect(text).toContain('Introspection connection lost');
            expect(text).not.toContain('hunter2');
            expect(text).toContain('***');
        } finally {
            log.mockRestore();
        }
    });

    it('makes the next Postgres step fail plainly instead of using the dead client', async () => {
        const client = Object.assign(new EventEmitter(), {
            query: vi.fn().mockResolvedValue({ rows: [] }),
            end: vi.fn().mockResolvedValue(undefined),
        });
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const watch = watchConnection(client, 'pw');
            const intro = new PostgresIntrospector(client as never, watch);
            dropped(client);
            // the catalog query itself is never sent down the dead client
            await expect(intro.catalog()).rejects.toBeInstanceOf(ConnectionLostError);
            const sent = client.query.mock.calls.map((c) => String(c[0]));
            expect(sent.every((q) => /^(BEGIN|ROLLBACK|COMMIT|SET|START)/i.test(q.trim()))).toBe(true);
        } finally {
            log.mockRestore();
        }
    });

    it('makes the next SQL Server step fail plainly instead of using the dead pool', async () => {
        const pool = Object.assign(new EventEmitter(), {
            request: vi.fn(),
            close: vi.fn().mockResolvedValue(undefined),
        });
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const watch = watchConnection(pool, 'pw');
            const intro = new SqlServerIntrospector(pool as never, watch);
            dropped(pool);
            await expect(intro.catalog()).rejects.toBeInstanceOf(ConnectionLostError);
            expect(pool.request).not.toHaveBeenCalled();
        } finally {
            log.mockRestore();
        }
    });
});
