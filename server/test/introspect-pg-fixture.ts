import pg from 'pg';

export const SAMPLE_DB = 'qubdidb_sample';
export const SAMPLE_ADMIN_URL =
    'postgres://qubdidb:qubdidb@localhost:5433/postgres';
export const SAMPLE_URL = `postgres://qubdidb:qubdidb@localhost:5433/${SAMPLE_DB}`;

export const SAMPLE_DDL = `
CREATE SCHEMA shop;
CREATE TYPE shop.order_status AS ENUM ('new', 'paid', 'shipped');

CREATE TABLE public.customers (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       varchar(120) NOT NULL,
    full_name   text,
    balance     numeric(10,2) NOT NULL DEFAULT 0,
    tags        integer[],
    created_at  timestamp(3) without time zone NOT NULL DEFAULT now(),
    CONSTRAINT customers_email_key UNIQUE (email)
);
COMMENT ON TABLE public.customers IS 'People who buy things';
COMMENT ON COLUMN public.customers.email IS 'Login email';

CREATE TABLE shop.orders (
    id           serial PRIMARY KEY,
    customer_id  bigint NOT NULL,
    status       shop.order_status NOT NULL DEFAULT 'new',
    placed_at    timestamptz NOT NULL DEFAULT now(),
    note         char(8),
    CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id)
        REFERENCES public.customers (id) ON DELETE CASCADE ON UPDATE SET NULL
);
CREATE INDEX orders_placed_idx ON shop.orders (placed_at DESC);
CREATE INDEX customers_email_lower_idx ON public.customers (lower(email));

CREATE TABLE shop.order_items (
    order_id  integer NOT NULL,
    line_no   smallint NOT NULL,
    sku       varchar(40) NOT NULL,
    qty       integer NOT NULL DEFAULT 1,
    PRIMARY KEY (order_id, line_no),
    CONSTRAINT items_order_fk FOREIGN KEY (order_id)
        REFERENCES shop.orders (id) ON DELETE RESTRICT
);

CREATE VIEW shop.paid_orders AS
    SELECT id, customer_id FROM shop.orders WHERE note IS NOT NULL;
`;

/** Recreates the sample database from scratch. */
export async function resetSampleDatabase() {
    const admin = new pg.Client({ connectionString: SAMPLE_ADMIN_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${SAMPLE_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${SAMPLE_DB}`);
    await admin.end();
    const db = new pg.Client({ connectionString: SAMPLE_URL });
    await db.connect();
    await db.query(SAMPLE_DDL);
    await db.end();
}
