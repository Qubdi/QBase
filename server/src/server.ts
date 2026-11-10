import { buildApp } from './app.js';
import { safeError } from './lib/safe-error.js';
import { ConfigError, loadConfig, startupWarnings } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { startEventBridge } from './events.js';
import { loadEnvFile } from './lib/env-file.js';
import { startMaintenance } from './maintenance.js';
import { createShutdown } from './shutdown.js';
import { runStartupTasks } from './startup.js';

// Settings live in server/.env (see .env.example); real environment variables win
loadEnvFile();

let config: ReturnType<typeof loadConfig>;
try {
    config = loadConfig();
} catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    process.exit(1);
}
for (const warning of startupWarnings(config)) console.warn(`Warning: ${warning}`);
// migrations get their own connection with no statement limit: one that
// rewrites a large table can take longer than any request should. Two
// connections: one holds the lock that makes replicas take turns, one migrates
const migrating = createDb(config.databaseUrl, {
    max: 2,
    // a migration that cannot get its table lock gives up and is retried,
    // instead of queueing and stalling the traffic behind it
    lockTimeoutMs: 10_000,
});
await runMigrations(migrating.db);
await migrating.pool.end();

const { db, pool } = createDb(config.databaseUrl, {
    max: config.dbPoolMax,
    statementTimeoutMs: config.dbStatementTimeoutSeconds * 1000,
});

// re-seals old secrets and, on an empty server, makes the first-run setup token
config = await runStartupTasks(db, config);

const app = buildApp({ config, db });
await app.listen({ port: config.port, host: config.host });
console.log(`QBase server listening on :${config.port}`);

// share viewers are told of publishes made by any replica, through Postgres
const stopEvents = await startEventBridge({
    databaseUrl: config.databaseUrl,
    notify: (channel, payload) =>
        pool.query('select pg_notify($1, $2)', [channel, payload]),
});

// drops expired sessions and old audit rows
const stopMaintenance = startMaintenance({ db, config });

// Docker and process managers stop the server with SIGTERM
const shutdown = createShutdown({
    stopMaintenance,
    stopEvents,
    closeApp: () => app.close(),
    closePool: () => pool.end(),
    exit: (code) => process.exit(code),
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
// an error nobody handled: log it and close in order (streams, pool) instead of
// dying half way, then exit with 1 so a process manager restarts the server
process.on('unhandledRejection', (reason) => {
    app.log.error({ err: safeError(reason) }, 'unhandled rejection');
    void shutdown('unhandledRejection', true);
});
process.on('uncaughtException', (err) => {
    app.log.error({ err: safeError(err) }, 'uncaught exception');
    void shutdown('uncaughtException', true);
});
