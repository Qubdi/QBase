// Regenerates the frontend fixtures from the real sample databases:
//   npx tsx scripts/dump-fixtures.ts
// Needs the sample Postgres (docker compose up -d db) and, for SQL Server,
// the optional container (docker compose --profile mssql up -d mssql).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import sql from 'mssql';
import { PostgresIntrospector } from '../src/introspect/postgres.js';
import { SqlServerIntrospector } from '../src/introspect/sqlserver.js';
import { resetSampleDatabase, SAMPLE_URL } from '../test/introspect-pg-fixture.js';
import {
    MSSQL_DB,
    mssqlConfig,
    resetMssqlSample,
    waitForMssql,
} from '../test/introspect-mssql-fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../src/lib/qubdi/__tests__/fixtures');
mkdirSync(out, { recursive: true });

const stable = (meta: { version: string }) => ({
    ...meta,
    // the version string changes with every image bump; keep fixtures stable
    version: meta.version.replace(/\s+on\s+.*$/s, '').slice(0, 60),
});

await resetSampleDatabase();
const client = new pg.Client({ connectionString: SAMPLE_URL });
await client.connect();
const pgMeta = await new PostgresIntrospector(client).introspect({ schemas: [] });
await client.end();
writeFileSync(path.join(out, 'postgres-sample.json'), JSON.stringify(stable(pgMeta), null, 2));
console.log('wrote postgres-sample.json');

if (await waitForMssql(30_000)) {
    await resetMssqlSample();
    const pool = await new sql.ConnectionPool(mssqlConfig(MSSQL_DB)).connect();
    const msMeta = await new SqlServerIntrospector(pool).introspect({ schemas: [] });
    await pool.close();
    writeFileSync(path.join(out, 'sqlserver-sample.json'), JSON.stringify(stable(msMeta), null, 2));
    console.log('wrote sqlserver-sample.json');
} else {
    console.log('SQL Server not reachable; skipped sqlserver-sample.json');
}
