import sql from 'mssql';

export const MSSQL_HOST = '127.0.0.1';
// the host port of docker-compose.mssql.yml (MSSQL_PORT there too)
export const MSSQL_PORT = Number(process.env.MSSQL_PORT ?? 14333);
export const MSSQL_USER = 'sa';
// chosen by whoever starts the container (see docker-compose.mssql.yml); without it the tests skip
export const MSSQL_PASSWORD = process.env.MSSQL_SA_PASSWORD ?? '';
export const MSSQL_DB = 'qubdi_sample';

const config = (database: string): sql.config => ({
    server: MSSQL_HOST,
    port: MSSQL_PORT,
    user: MSSQL_USER,
    password: MSSQL_PASSWORD,
    database,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 3000,
    requestTimeout: 30000,
});

/** Each entry is its own batch (CREATE VIEW must be alone in a batch). */
export const MSSQL_DDL = [
    `CREATE SCHEMA shop`,
    `CREATE TABLE dbo.customers (
        id          bigint IDENTITY(1,1) NOT NULL CONSTRAINT pk_customers PRIMARY KEY,
        email       nvarchar(120) NOT NULL,
        full_name   nvarchar(max) NULL,
        balance     decimal(10,2) NOT NULL CONSTRAINT df_customers_balance DEFAULT 0,
        created_at  datetime2(3) NOT NULL CONSTRAINT df_customers_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT uq_customers_email UNIQUE (email)
    )`,
    `EXEC sp_addextendedproperty N'MS_Description', N'People who buy things', N'SCHEMA', N'dbo', N'TABLE', N'customers'`,
    `EXEC sp_addextendedproperty N'MS_Description', N'Login email', N'SCHEMA', N'dbo', N'TABLE', N'customers', N'COLUMN', N'email'`,
    `CREATE TABLE shop.orders (
        id           int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        customer_id  bigint NOT NULL,
        status       varchar(20) NOT NULL DEFAULT 'new',
        placed_at    datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        note         char(8) NULL,
        CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id)
            REFERENCES dbo.customers (id) ON DELETE CASCADE ON UPDATE NO ACTION
    )`,
    `CREATE INDEX orders_placed_idx ON shop.orders (placed_at DESC)`,
    `CREATE TABLE shop.order_items (
        order_id  int NOT NULL,
        line_no   smallint NOT NULL,
        sku       varchar(40) NOT NULL,
        qty       int NOT NULL DEFAULT 1,
        PRIMARY KEY (order_id, line_no),
        CONSTRAINT items_order_fk FOREIGN KEY (order_id)
            REFERENCES shop.orders (id) ON DELETE NO ACTION ON UPDATE CASCADE
    )`,
    `CREATE VIEW shop.paid_orders AS SELECT id, customer_id FROM shop.orders WHERE note IS NOT NULL`,
];

export async function mssqlAvailable(): Promise<boolean> {
    try {
        const pool = await new sql.ConnectionPool(config('master')).connect();
        await pool.close();
        return true;
    } catch {
        return false;
    }
}

/** Waits for the container to accept logins (it needs a while on first start). */
export async function waitForMssql(timeoutMs = 90_000): Promise<boolean> {
    // no password, no container to reach: skip at once instead of waiting for one
    if (!MSSQL_PASSWORD) return false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await mssqlAvailable()) return true;
        await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
}

export async function resetMssqlSample() {
    const master = await new sql.ConnectionPool(config('master')).connect();
    await master.request().batch(`
        IF DB_ID('${MSSQL_DB}') IS NOT NULL
        BEGIN
            ALTER DATABASE ${MSSQL_DB} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE ${MSSQL_DB};
        END`);
    await master.request().batch(`CREATE DATABASE ${MSSQL_DB}`);
    await master.close();
    const db = await new sql.ConnectionPool(config(MSSQL_DB)).connect();
    for (const stmt of MSSQL_DDL) await db.request().batch(stmt);
    await db.close();
}

export { config as mssqlConfig };
