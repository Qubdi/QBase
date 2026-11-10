import { buildApp } from './app.js';
import { ConfigError, loadConfig, startupWarnings } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { resealPlaintextWebhooks } from './drift/reseal.js';
import { resealStoredSecrets } from './reseal.js';
import { startEventBridge } from './events.js';
import { loadEnvFile } from './lib/env-file.js';
import { startMaintenance } from './maintenance.js';
import { createShutdown } from './shutdown.js';

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

// webhook URLs saved before encryption existed are sealed now. A failure here
// leaves them readable as before; it must not stop the server from starting.
if (config.secretsKey) {
    try {
        const sealed = await resealPlaintextWebhooks(db, config.secretsKey);
        if (sealed > 0) console.log(`Encrypted ${sealed} saved webhook URL(s)`);
    } catch (err) {
        console.error(
            'Could not encrypt saved webhook URLs:',
            err instanceof Error ? err.message : err
        );
    }
}

// values sealed in the old format, or with the shared key from before purposes
// existed, are written again in the current one, so no open path falls back to
// the shared key. A failure leaves them as they were and does not stop the server.
try {
    for (const c of await resealStoredSecrets(db, config)) {
        if (c.resealed > 0) console.log(`Re-sealed ${c.resealed} value(s) in ${c.column}`);
        if (c.unreadable > 0) {
            console.warn(
                `Warning: ${c.unreadable} value(s) in ${c.column} could not be opened with the current key and were left as they are`
            );
        }
    }
} catch (err) {
    console.error('Could not re-seal stored secrets:', err instanceof Error ? err.message : err);
}

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
    app.log.error({ err: reason }, 'unhandled rejection');
    void shutdown('unhandledRejection', true);
});
process.on('uncaughtException', (err) => {
    app.log.error({ err }, 'uncaught exception');
    void shutdown('uncaughtException', true);
});
