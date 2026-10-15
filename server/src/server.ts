import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { startMaintenance } from './maintenance.js';
import { startDriftScheduler } from './drift/service.js';
import { defaultIntrospectorFactory } from './introspect/routes.js';

// Settings live in server/.env (see .env.example); real environment variables win
try {
    process.loadEnvFile();
} catch {
    // no .env file: use the environment as is
}

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl, { max: config.dbPoolMax });
await runMigrations(db);

const app = buildApp({ config, db });
// scheduled drift checks run inside this process
const stopScheduler = startDriftScheduler({
    db,
    config,
    factory: defaultIntrospectorFactory,
});
await app.listen({ port: config.port, host: config.host });
console.log(`QubdiDB server listening on :${config.port}`);

// drops expired sessions and old audit rows
const stopMaintenance = startMaintenance({ db, config });

// Docker and process managers stop the server with SIGTERM: finish what is
// running, close the streams, then release the database connections.
let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, shutting down`);
    // a stuck request must not keep the process alive for ever
    setTimeout(() => process.exit(1), 10_000).unref();
    try {
        await stopScheduler();
        await stopMaintenance();
        await app.close();
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Shutdown failed:', err);
        process.exit(1);
    }
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
