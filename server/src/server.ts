import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { startDriftScheduler } from './drift/service.js';
import { defaultIntrospectorFactory } from './introspect/routes.js';

// Settings live in server/.env (see .env.example); real environment variables win
try {
    process.loadEnvFile();
} catch {
    // no .env file: use the environment as is
}

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
await runMigrations(db);

const app = buildApp({ config, db });
// scheduled drift checks run inside this process
startDriftScheduler({
    db,
    config,
    factory: defaultIntrospectorFactory,
});
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`QubdiDB server listening on :${config.port}`);
