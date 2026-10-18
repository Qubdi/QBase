import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { startMaintenance } from './maintenance.js';
import { createShutdown } from './shutdown.js';

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
await app.listen({ port: config.port, host: config.host });
console.log(`QubdiDB server listening on :${config.port}`);

// drops expired sessions and old audit rows
const stopMaintenance = startMaintenance({ db, config });

// Docker and process managers stop the server with SIGTERM
const shutdown = createShutdown({
    stopMaintenance,
    closeApp: () => app.close(),
    closePool: () => pool.end(),
    exit: (code) => process.exit(code),
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
