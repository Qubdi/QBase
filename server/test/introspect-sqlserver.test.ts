import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '../src/introspect/readonly-guard.js';
import {
    PrivilegedLoginError,
    SqlServerIntrospector,
    connectSqlServer,
} from '../src/introspect/sqlserver.js';
import type { DatabaseMetadata } from '../src/introspect/types.js';
import {
    MSSQL_DB,
    MSSQL_HOST,
    MSSQL_PASSWORD,
    MSSQL_PORT,
    MSSQL_SKIP_NOTICE,
    MSSQL_USER,
    mssqlRequired,
    mssqlConfig,
    resetMssqlSample,
    waitForMssql,
} from './introspect-mssql-fixture.js';

// Needs the optional container and its password: see docker-compose.mssql.yml
const up = await waitForMssql(Number(process.env.MSSQL_WAIT_MS ?? 90_000));
const required = mssqlRequired();
// a skip nobody sees is how a suite stops running: say it, loudly
if (!up && !required) console.warn(MSSQL_SKIP_NOTICE);

// where the run needs SQL Server (CI with the container set up, or REQUIRE_MSSQL=1)
// an unreachable one is a failure, not a quiet skip
describe.runIf(required)('SQL Server is reachable where the suite requires it', () => {
    it('answers on the configured port', () => {
        expect(up, 'SQL Server did not answer, but this run requires it (REQUIRE_MSSQL=1, or CI with MSSQL_SA_PASSWORD set)').toBe(true);
    });
});

// the skip is in the suite's name too: a reporter shows names, and a console line of a skipped file is dropped
describe.skipIf(!up)(`SQL Server introspection against a real database${up ? '' : ' [NOT RUN: no reachable SQL Server, see docker-compose.mssql.yml; REQUIRE_MSSQL=1 makes this a failure]'}`, () => {
    let intro: SqlServerIntrospector;
    let pool: sql.ConnectionPool;
    let meta: DatabaseMetadata;
    const sent: string[] = [];

    beforeAll(async () => {
        await resetMssqlSample();
        pool = await new sql.ConnectionPool(mssqlConfig(MSSQL_DB)).connect();
        // record every statement the driver sends
        const originalRequest = pool.request.bind(pool);
        pool.request = () => {
            const request = originalRequest();
            const originalQuery = request.query.bind(request) as (t: string) => unknown;
            (request as unknown as { query: unknown }).query = (text: string) => {
                sent.push(text);
                return originalQuery(text);
            };
            return request;
        };
        intro = new SqlServerIntrospector(pool);
        meta = await intro.introspect({ schemas: [] });
    }, 120_000);
    afterAll(async () => {
        await pool?.close();
    });

    const col = (schema: string, table: string, name: string) =>
        meta.columns.find((c) => c.schema === schema && c.table === table && c.name === name)!;

    it('reads database name and version', () => {
        expect(meta.database_name).toBe(MSSQL_DB);
        expect(meta.version).toMatch(/Microsoft SQL Server/);
    });

    it('finds every user table and view and no system objects', () => {
        // views are listed as tables too (type VIEW), as QBase's own scripts do
        expect(meta.tables.filter((t) => t.type !== 'VIEW').map((t) => `${t.schema}.${t.table}`).sort()).toEqual([
            'dbo.customers',
            'shop.order_items',
            'shop.orders',
        ]);
        expect(meta.tables.filter((t) => t.type === 'VIEW').map((t) => `${t.schema}.${t.table}`)).toEqual(['shop.paid_orders']);
        expect(meta.views.map((v) => `${v.schema}.${v.view_name}`)).toEqual(['shop.paid_orders']);
        // QBase expects view definitions base64-encoded (UTF-16LE for SQL Server)
        expect(Buffer.from(meta.views[0].view_definition!, 'base64').toString('utf16le')).toMatch(/note/i);
        expect(meta.columns.some((c) => c.schema === 'sys' || c.schema === 'INFORMATION_SCHEMA')).toBe(false);
    });

    it('reads table and column comments from extended properties', () => {
        expect(meta.tables.find((t) => t.table === 'customers')?.comment).toBe('People who buy things');
        expect(col('dbo', 'customers', 'email').comment).toBe('Login email');
        expect(col('dbo', 'customers', 'id').comment).toBeNull();
    });

    it('reads types, lengths, precision, nullability and defaults', () => {
        expect(col('dbo', 'customers', 'email')).toMatchObject({
            type: 'nvarchar',
            character_maximum_length: '120',
            nullable: false,
        });
        expect(col('dbo', 'customers', 'full_name')).toMatchObject({
            type: 'nvarchar',
            character_maximum_length: 'max',
            nullable: true,
        });
        expect(col('dbo', 'customers', 'balance')).toMatchObject({
            type: 'decimal',
            precision: { precision: 10, scale: 2 },
            default: '((0))',
        });
        expect(col('dbo', 'customers', 'created_at')).toMatchObject({
            type: 'datetime2',
            precision: { precision: 3, scale: null },
        });
        expect(col('shop', 'orders', 'note')).toMatchObject({ type: 'char', character_maximum_length: '8', nullable: true });
        expect(col('shop', 'orders', 'status')).toMatchObject({ type: 'varchar', character_maximum_length: '20' });
        expect(col('shop', 'order_items', 'qty').default).toBe('((1))');
    });

    it('detects identity columns and keeps column order', () => {
        expect(col('dbo', 'customers', 'id').is_identity).toBe(true);
        expect(col('shop', 'orders', 'id').is_identity).toBe(true);
        expect(col('shop', 'order_items', 'qty').is_identity).toBe(false);
        const names = meta.columns
            .filter((c) => c.table === 'customers')
            .sort((a, b) => a.ordinal_position - b.ordinal_position)
            .map((c) => c.name);
        expect(names).toEqual(['id', 'email', 'full_name', 'balance', 'created_at']);
    });

    it('reads primary keys including composite order', () => {
        const pk = (t: string) => meta.pk_info.filter((p) => p.table === t).map((p) => p.column);
        expect(pk('customers')).toEqual(['id']);
        expect(pk('orders')).toEqual(['id']);
        expect(pk('order_items')).toEqual(['order_id', 'line_no']);
        expect(meta.pk_info.find((p) => p.table === 'order_items')?.pk_def).toBe('PRIMARY KEY (order_id, line_no)');
    });

    it('reads foreign keys with ON DELETE / ON UPDATE actions', () => {
        const fk = (name: string) => meta.fk_info.find((f) => f.foreign_key_name === name)!;
        expect(fk('orders_customer_fk')).toMatchObject({
            schema: 'shop',
            table: 'orders',
            column: 'customer_id',
            reference_schema: 'dbo',
            reference_table: 'customers',
            reference_column: 'id',
        });
        expect(fk('orders_customer_fk').fk_def).toMatch(/ON DELETE CASCADE ON UPDATE NO ACTION$/);
        expect(fk('items_order_fk').fk_def).toMatch(/ON DELETE NO ACTION ON UPDATE CASCADE$/);
        expect(meta.fk_info).toHaveLength(2);
    });

    it('reads unique constraints and indexes with direction', () => {
        const idx = (name: string) => meta.indexes.filter((i) => i.name === name);
        expect(idx('uq_customers_email')).toMatchObject([{ column: 'email', unique: true, direction: 'ASC' }]);
        expect(idx('orders_placed_idx')).toMatchObject([{ column: 'placed_at', unique: false, direction: 'DESC' }]);
        const pk = meta.indexes.filter((i) => i.table === 'order_items' && i.unique);
        expect(pk.map((i) => i.column)).toEqual(['order_id', 'line_no']);
    });

    it('lists the catalog and respects the schema filter', async () => {
        expect(await intro.catalog()).toEqual([
            { schema: 'dbo', tables: ['customers'], views: [] },
            { schema: 'shop', tables: ['order_items', 'orders'], views: ['paid_orders'] },
        ]);
        const only = await intro.introspect({ schemas: ['shop'] });
        expect(only.tables.every((t) => t.schema === 'shop')).toBe(true);
        expect(only.tables).toHaveLength(3); // two tables and the view
    });

    it('sent only read-only statements', () => {
        expect(sent.length).toBeGreaterThan(5);
        for (const text of sent) {
            expect(() => assertReadOnlySql(text), text).not.toThrow();
        }
    });

    it('leaves the database untouched', async () => {
        const count = async () =>
            (await pool.request().query(`SELECT COUNT(*) AS n FROM sys.objects WHERE is_ms_shipped = 0`)).recordset[0].n;
        const before = await count();
        await intro.introspect({ schemas: [] });
        await intro.introspect({ schemas: ['shop'] });
        expect(await count()).toBe(before);
    });

    it('refuses a sysadmin login unless INTROSPECT_ALLOW_PRIVILEGED is 1', async () => {
        // the fixture logs in as sa, a sysadmin
        const connect = () =>
            connectSqlServer(
                {
                    dialect: 'sqlserver',
                    host: 'localhost',
                    port: MSSQL_PORT,
                    database: MSSQL_DB,
                    user: MSSQL_USER,
                    password: MSSQL_PASSWORD,
                    ssl: false,
                    trustServerCertificate: true,
                },
                { address: MSSQL_HOST, family: 4 }
            );
        await expect(connect()).rejects.toBeInstanceOf(PrivilegedLoginError);
    });

    it('connects through connectSqlServer with a vetted address', async () => {
        const i = await connectSqlServer(
            {
                dialect: 'sqlserver',
                host: 'localhost',
                port: MSSQL_PORT,
                database: MSSQL_DB,
                user: MSSQL_USER,
                password: MSSQL_PASSWORD,
                ssl: false,
                trustServerCertificate: true,
            },
            { address: MSSQL_HOST, family: 4 },
            true
        );
        try {
            expect((await i.catalog()).map((s) => s.schema)).toEqual(['dbo', 'shop']);
        } finally {
            await i.close();
        }
    });

    it('fails with wrong credentials', async () => {
        await expect(
            connectSqlServer(
                {
                    dialect: 'sqlserver',
                    host: 'localhost',
                    port: MSSQL_PORT,
                    database: MSSQL_DB,
                    user: MSSQL_USER,
                    password: 'wrong-password',
                    ssl: false,
                    trustServerCertificate: true,
                },
                { address: MSSQL_HOST, family: 4 }
            )
        ).rejects.toThrow();
    });
});
