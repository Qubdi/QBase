import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// server.ts is a script: importing it starts the server. Everything it starts is
// replaced here, so what is checked is the order and arguments of the wiring.
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const mark = (name: string) => calls.order.push(name);

class FakeConfigError extends Error {}
const config = {
    databaseUrl: 'postgres://u:p@db/x',
    dbPoolMax: 7,
    dbStatementTimeoutSeconds: 30,
    port: 4321,
    host: '127.0.0.1',
    setupToken: null as string | null,
};
const settings = vi.hoisted(() => ({ configError: false }));

vi.mock('../src/config.js', () => ({
    ConfigError: FakeConfigError,
    loadConfig: vi.fn(() => {
        if (settings.configError) throw new FakeConfigError('PORT must be a whole number');
        return config;
    }),
    startupWarnings: vi.fn(() => ['a warning']),
}));
vi.mock('../src/lib/env-file.js', () => ({ loadEnvFile: vi.fn(() => mark('env')) }));

const migrating = { db: { name: 'migrating' }, pool: { end: vi.fn(async () => mark('migrating pool end')) } };
const main = { db: { name: 'main' }, pool: { end: vi.fn(async () => mark('pool end')), query: vi.fn() } };
const createDb = vi.fn((_url: string, opts: { max: number }) => (opts.max === 2 ? migrating : main));
const runMigrations = vi.fn(async () => mark('migrate'));
vi.mock('../src/db/client.js', () => ({ createDb, runMigrations }));

const served = { ...config, setupToken: 'made-at-start' };
const runStartupTasks = vi.fn(async () => {
    mark('startup tasks');
    return served;
});
vi.mock('../src/startup.js', () => ({ runStartupTasks }));

const app = {
    listen: vi.fn(async () => mark('listen')),
    close: vi.fn(async () => mark('app close')),
    log: { error: vi.fn() },
};
const buildApp = vi.fn(() => app);
vi.mock('../src/app.js', () => ({ buildApp }));

const startEventBridge = vi.fn(async (_options: { databaseUrl: string; notify: (c: string, p: string) => unknown }) => {
    mark('events');
    return async () => mark('events stop');
});
vi.mock('../src/events.js', () => ({ startEventBridge }));
const startMaintenance = vi.fn(() => {
    mark('maintenance');
    return async () => mark('maintenance stop');
});
vi.mock('../src/maintenance.js', () => ({ startMaintenance }));

describe('server.ts start and stop wiring', () => {
    const handlers = new Map<string, (...a: unknown[]) => unknown>();
    let exit: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        calls.order.length = 0;
        settings.configError = false;
        handlers.clear();
        vi.resetModules();
        for (const m of [createDb, runMigrations, runStartupTasks, buildApp, startEventBridge, startMaintenance, app.listen, app.close, app.log.error, main.pool.query]) m.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(process, 'on').mockImplementation(((event: string, fn: (...a: unknown[]) => unknown) => {
            handlers.set(event, fn);
            return process;
        }) as never);
        exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });
    afterEach(() => vi.restoreAllMocks());

    it('starts in order: migrate on its own connection, serve with the started config, then events and maintenance', async () => {
        await import('../src/server.js');
        expect(calls.order).toEqual([
            'env',
            'migrate',
            'migrating pool end',
            'startup tasks',
            'listen',
            'events',
            'maintenance',
        ]);
        // migrations: two connections, no statement limit; the app's own pool is sized from the config
        expect(createDb).toHaveBeenNthCalledWith(1, config.databaseUrl, expect.objectContaining({ max: 2, lockTimeoutMs: 10_000 }));
        expect(createDb).toHaveBeenNthCalledWith(2, config.databaseUrl, { max: 7, statementTimeoutMs: 30_000 });
        expect(runMigrations).toHaveBeenCalledWith(migrating.db);
        // the app is built with what the start-up tasks returned (the setup token)
        expect(runStartupTasks).toHaveBeenCalledWith(main.db, config);
        expect(buildApp).toHaveBeenCalledWith({ config: served, db: main.db });
        expect(app.listen).toHaveBeenCalledWith({ port: 4321, host: '127.0.0.1' });
        expect(startMaintenance).toHaveBeenCalledWith({ db: main.db, config: served });
    });

    it("relays events through the app pool's pg_notify", async () => {
        await import('../src/server.js');
        const opts = startEventBridge.mock.calls[0][0];
        expect(opts.databaseUrl).toBe(config.databaseUrl);
        opts.notify('chan', 'payload');
        expect(main.pool.query).toHaveBeenCalledWith('select pg_notify($1, $2)', ['chan', 'payload']);
    });

    it('stops on SIGTERM: maintenance and the app together, then the events connection, then the pool, then exit 0', async () => {
        await import('../src/server.js');
        expect([...handlers.keys()].sort()).toEqual(['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection']);
        calls.order.length = 0;
        // the handler starts the shutdown and returns: wait for it to end the process
        handlers.get('SIGTERM')!();
        await vi.waitFor(() => expect(exit).toHaveBeenCalled());
        expect([...calls.order.slice(0, 2)].sort()).toEqual(['app close', 'maintenance stop']);
        expect(calls.order.slice(2)).toEqual(['events stop', 'pool end']);
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('shuts down once however many signals arrive', async () => {
        await import('../src/server.js');
        handlers.get('SIGTERM')!();
        handlers.get('SIGINT')!();
        await vi.waitFor(() => expect(exit).toHaveBeenCalled());
        expect(app.close).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
    });

    it('closes the same way and exits 1 on an unhandled rejection or exception', async () => {
        await import('../src/server.js');
        const reason = new Error('nobody caught this');
        handlers.get('unhandledRejection')!(reason);
        await vi.waitFor(() => expect(exit).toHaveBeenCalled());
        expect(app.log.error).toHaveBeenCalledWith(
            { err: expect.objectContaining({ message: 'nobody caught this' }) },
            'unhandled rejection'
        );
        expect(calls.order).toContain('pool end');
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('prints a bad setting and exits 1 before anything is started', async () => {
        settings.configError = true;
        // process.exit is stubbed, so the script goes on with no config and fails there
        await import('../src/server.js').catch(() => undefined);
        expect(console.error).toHaveBeenCalledWith('PORT must be a whole number');
        expect(exit).toHaveBeenCalledWith(1);
        expect(createDb).not.toHaveBeenCalled();
        expect(app.listen).not.toHaveBeenCalled();
    });
});
