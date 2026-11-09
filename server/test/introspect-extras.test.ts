import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterMetadata } from '../src/introspect/filter.js';
import { PostgresIntrospector, POSTGRES_QUERIES } from '../src/introspect/postgres.js';
import { assertReadOnlySql } from '../src/introspect/readonly-guard.js';
import type { DatabaseMetadata } from '../src/introspect/types.js';
import { defaultIntrospectorFactory } from '../src/introspect/routes.js';
import { as, createTestApp, registerUser, type TestCtx } from './helpers.js';
import { PG_PASSWORD, PG_PORT, PG_USER, SAMPLE_ADMIN_URL } from './introspect-pg-fixture.js';

// A second database, so the shared sample (whose counts other tests assert) stays as it is.
const DB = 'qbase_extras';
const URL = `postgres://${encodeURIComponent(PG_USER)}:${encodeURIComponent(PG_PASSWORD)}@localhost:${PG_PORT}/${DB}`;

const DDL = `
CREATE SCHEMA sales;
CREATE TYPE sales.status AS ENUM ('new', 'paid', 'shipped');
CREATE TYPE sales.money_pair AS (amount numeric(12,2), currency char(3));
CREATE DOMAIN sales.email AS varchar(120) CHECK (VALUE LIKE '%@%');
CREATE DOMAIN public.pos_int AS integer CHECK (VALUE > 0);
CREATE TABLE sales.customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email sales.email NOT NULL,
  qty public.pos_int,
  first_name text NOT NULL,
  last_name text NOT NULL,
  full_name text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  deleted_at timestamptz,
  score integer NOT NULL DEFAULT 0,
  state sales.status NOT NULL DEFAULT 'new',
  CONSTRAINT score_nonneg CHECK (score >= 0),
  CONSTRAINT name_len CHECK (length(first_name) < 100)
);
CREATE INDEX customers_score_desc ON sales.customers (score DESC, id);
CREATE INDEX customers_live ON sales.customers (last_name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX customers_email_live ON sales.customers (email) WHERE deleted_at IS NULL;
CREATE INDEX customers_half_built ON sales.customers (first_name);
UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'sales.customers_half_built'::regclass;
CREATE TABLE sales.events (
  id serial,
  at date NOT NULL,
  CONSTRAINT events_pk PRIMARY KEY (id, at),
  CONSTRAINT events_recent CHECK (at > DATE '2000-01-01')
) PARTITION BY RANGE (at);
CREATE TABLE sales.events_2024 PARTITION OF sales.events FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
`;

describe('PostgreSQL introspection: checks, custom types, domains, generated columns, index details', () => {
    let intro: PostgresIntrospector;
    let meta: DatabaseMetadata;
    let ctx: TestCtx;

    beforeAll(async () => {
        const admin = new pg.Client({ connectionString: SAMPLE_ADMIN_URL });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
        await admin.query(`CREATE DATABASE ${DB}`);
        await admin.end();
        const db = new pg.Client({ connectionString: URL });
        await db.connect();
        await db.query(DDL);
        await db.end();
        const client = new pg.Client({ connectionString: URL });
        await client.connect();
        intro = new PostgresIntrospector(client);
        meta = await intro.introspect({ schemas: [] });
        ctx = await createTestApp(
            { introspectAllowHosts: ['127.0.0.1', '::1'] },
            { factory: defaultIntrospectorFactory }
        );
        if (process.env.DUMP_META) writeFileSync(process.env.DUMP_META, JSON.stringify(meta));
    });
    afterAll(async () => {
        await ctx?.close();
        await intro?.close();
        const admin = new pg.Client({ connectionString: SAMPLE_ADMIN_URL });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
        await admin.end();
    });

    it('lists check constraints with the bare expression, in name order', () => {
        expect(meta.check_constraints).toEqual([
            { schema: 'sales', table: 'customers', expression: '(length(first_name) < 100)' },
            { schema: 'sales', table: 'customers', expression: '(score >= 0)' },
            { schema: 'sales', table: 'events', expression: '(at > \'2000-01-01\'::date)' },
        ]);
    });

    it('lists enum and composite types', () => {
        expect(meta.custom_types).toContainEqual({
            schema: 'sales',
            type: 'status',
            kind: 'enum',
            values: ['new', 'paid', 'shipped'],
        });
        expect(meta.custom_types).toContainEqual({
            schema: 'sales',
            type: 'money_pair',
            kind: 'composite',
            fields: [
                { field: 'amount', type: 'numeric(12,2)' },
                { field: 'currency', type: 'character(3)' },
            ],
        });
        expect(meta.custom_types).toHaveLength(2);
    });

    it('reports a domain column with the base type, length and the domain name', () => {
        const col = (n: string) => meta.columns.find((c) => c.table === 'customers' && c.name === n)!;
        expect(col('email')).toMatchObject({ type: 'character varying', character_maximum_length: '120', domain: 'email' });
        expect(col('qty')).toMatchObject({ type: 'integer', domain: 'pos_int' });
        expect(col('first_name').domain).toBeNull();
    });

    it('reports a generated column by its expression and keeps no default for it', () => {
        const full = meta.columns.find((c) => c.name === 'full_name')!;
        expect(full.generated).toEqual({ expression: "((first_name || ' '::text) || last_name)", stored: true });
        expect(full.default).toBeNull();
        expect(meta.columns.find((c) => c.name === 'score')!.generated).toBeNull();
        expect(meta.columns.find((c) => c.name === 'score')!.default).toBe('0');
    });

    it('reports index predicates and directions', () => {
        const rows = (n: string) => meta.indexes.filter((i) => i.name === n);
        expect(rows('customers_live')).toMatchObject([{ column: 'last_name', where: '(deleted_at IS NULL)', unique: false }]);
        expect(rows('customers_email_live')).toMatchObject([{ where: '(deleted_at IS NULL)', unique: true }]);
        expect(rows('customers_score_desc').map((r) => [r.column, r.direction, r.where])).toEqual([
            ['score', 'DESC', null],
            ['id', 'ASC', null],
        ]);
    });

    it('leaves out an index that a failed CONCURRENTLY build left invalid', () => {
        // the catalog still lists it, but no query can use it
        expect(meta.indexes.some((i) => i.name === 'customers_half_built')).toBe(false);
        expect(meta.indexes.some((i) => i.name === 'customers_live')).toBe(true);
    });

    it('hides a partition behind its parent, like the client script', () => {
        expect(meta.tables.map((t) => t.table).sort()).toEqual(['customers', 'events']);
        expect(meta.columns.some((c) => c.table === 'events_2024')).toBe(false);
        expect(meta.check_constraints!.filter((c) => c.table === 'events')).toHaveLength(1);
    });

    it('keeps checks of the chosen tables only, through the filter', () => {
        const only = filterMetadata(meta, ['sales.events']);
        expect(only.check_constraints).toHaveLength(1);
        expect(only.custom_types).toHaveLength(2);
    });

    it('POST /introspect returns the same extras over HTTP', async () => {
        const user = await registerUser(ctx.app, 'extras@example.com');
        const res = await ctx.app.inject({
            method: 'POST',
            url: '/introspect',
            headers: as(user),
            payload: {
                connection: {
                    dialect: 'postgresql',
                    host: '127.0.0.1',
                    port: PG_PORT,
                    database: DB,
                    user: PG_USER,
                    password: PG_PASSWORD,
                },
            },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json().metadata as DatabaseMetadata;
        expect(body.check_constraints).toHaveLength(3);
        expect(body.custom_types?.map((t) => t.kind).sort()).toEqual(['composite', 'enum']);
        expect(body.columns.find((c) => c.name === 'full_name')?.generated?.stored).toBe(true);
        expect(body.indexes.find((i) => i.name === 'customers_live')?.where).toBe('(deleted_at IS NULL)');
    });

    it('sends only read-only statements', () => {
        for (const q of Object.values(POSTGRES_QUERIES)) expect(() => assertReadOnlySql(q)).not.toThrow();
    });
});
