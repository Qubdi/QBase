import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterMetadata } from '../src/introspect/filter.js';
import {
    POSTGRES_QUERIES,
    PostgresIntrospector,
    connectPostgres,
    withReadOnlyTransaction,
} from '../src/introspect/postgres.js';
import { assertReadOnlySql } from '../src/introspect/readonly-guard.js';
import { decodeTypmod, splitArrayType } from '../src/introspect/typmod.js';
import type { DatabaseMetadata } from '../src/introspect/types.js';
import { resetSampleDatabase, SAMPLE_DB, SAMPLE_URL } from './introspect-pg-fixture.js';

const params = {
    dialect: 'postgresql' as const,
    host: 'localhost',
    port: 5433,
    database: SAMPLE_DB,
    user: 'qubdidb',
    password: 'qubdidb',
    ssl: false,
    trustServerCertificate: false,
};

describe('typmod decoding', () => {
    it('decodes character lengths', () => {
        expect(decodeTypmod('character varying', 124).characterMaximumLength).toBe('120');
        expect(decodeTypmod('character', 12).characterMaximumLength).toBe('8');
        expect(decodeTypmod('character varying', -1).characterMaximumLength).toBeNull();
        expect(decodeTypmod('bit', 5).characterMaximumLength).toBe('5');
    });

    it('decodes numeric precision and scale', () => {
        expect(decodeTypmod('numeric', ((10 << 16) | 2) + 4).precision).toEqual({ precision: 10, scale: 2 });
        expect(decodeTypmod('numeric', -1).precision).toBeNull();
        expect(decodeTypmod('numeric', ((5 << 16) | 0) + 4).precision).toEqual({ precision: 5, scale: 0 });
    });

    it('decodes time precision and ignores unrelated types', () => {
        expect(decodeTypmod('timestamp without time zone', 3).precision).toEqual({ precision: 3, scale: null });
        expect(decodeTypmod('timestamp with time zone', -1).precision).toBeNull();
        expect(decodeTypmod('integer', 5)).toEqual({ characterMaximumLength: null, precision: null });
        expect(decodeTypmod('text', 100)).toEqual({ characterMaximumLength: null, precision: null });
    });

    it('splits array types', () => {
        expect(splitArrayType('integer[]')).toEqual({ base: 'integer', isArray: true });
        expect(splitArrayType('text[][]')).toEqual({ base: 'text', isArray: true });
        expect(splitArrayType('text')).toEqual({ base: 'text', isArray: false });
    });
});

describe('filterMetadata', () => {
    const meta = {
        database_name: 'd',
        version: 'v',
        tables: [
            { schema: 'a', table: 't1' },
            { schema: 'a', table: 't2' },
            { schema: 'b', table: 't3' },
        ],
        views: [{ schema: 'a', view_name: 'v1' }],
        columns: [
            { schema: 'a', table: 't1', name: 'id', type: 'int', ordinal_position: 1, nullable: false },
            { schema: 'a', table: 't2', name: 'id', type: 'int', ordinal_position: 1, nullable: false },
            { schema: 'b', table: 't3', name: 'id', type: 'int', ordinal_position: 1, nullable: false },
        ],
        pk_info: [
            { schema: 'a', table: 't1', column: 'id', pk_def: '' },
            { schema: 'b', table: 't3', column: 'id', pk_def: '' },
        ],
        indexes: [],
        fk_info: [
            { schema: 'a', table: 't2', column: 'id', foreign_key_name: 'f1', reference_schema: 'a', reference_table: 't1', reference_column: 'id', fk_def: '' },
            { schema: 'a', table: 't2', column: 'id', foreign_key_name: 'f2', reference_schema: 'b', reference_table: 't3', reference_column: 'id', fk_def: '' },
        ],
    } as unknown as DatabaseMetadata;

    it('keeps everything for an empty selection', () => {
        expect(filterMetadata(meta, undefined)).toBe(meta);
        expect(filterMetadata(meta, [])).toBe(meta);
    });

    it('keeps only chosen tables and foreign keys whose both ends survive', () => {
        const out = filterMetadata(meta, ['a.t1', 'a.t2']);
        expect(out.tables.map((t) => t.table)).toEqual(['t1', 't2']);
        expect(out.columns).toHaveLength(2);
        expect(out.pk_info.map((p) => p.table)).toEqual(['t1']);
        expect(out.fk_info.map((f) => f.foreign_key_name)).toEqual(['f1']);
        expect(out.views).toHaveLength(0);
    });
});

describe('PostgreSQL introspection against a real database', () => {
    let intro: PostgresIntrospector;
    let meta: DatabaseMetadata;
    const sent: string[] = [];

    beforeAll(async () => {
        await resetSampleDatabase();
        // wrap a real client so every statement the driver sends is recorded
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        const original = client.query.bind(client) as (...a: unknown[]) => unknown;
        (client as unknown as { query: unknown }).query = (...args: unknown[]) => {
            sent.push(typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]));
            return original(...args);
        };
        intro = new PostgresIntrospector(client);
        meta = await intro.introspect({ schemas: [] });
    });
    afterAll(async () => {
        await intro?.close();
    });

    const col = (schema: string, table: string, name: string) =>
        meta.columns.find((c) => c.schema === schema && c.table === table && c.name === name)!;

    it('reads database name and version', () => {
        expect(meta.database_name).toBe(SAMPLE_DB);
        expect(meta.version).toMatch(/PostgreSQL/);
    });

    it('finds every user table and view, and no system objects', () => {
        // views are listed as tables too (type VIEW), as QubdiDB's own scripts do
        expect(meta.tables.filter((t) => t.type !== 'VIEW').map((t) => `${t.schema}.${t.table}`).sort()).toEqual([
            'public.customers',
            'shop.order_items',
            'shop.orders',
        ]);
        expect(meta.tables.filter((t) => t.type === 'VIEW').map((t) => `${t.schema}.${t.table}`)).toEqual(['shop.paid_orders']);
        expect(meta.views.map((v) => `${v.schema}.${v.view_name}`)).toEqual(['shop.paid_orders']);
        // QubdiDB expects view definitions base64-encoded (UTF-8 for PostgreSQL)
        expect(Buffer.from(meta.views[0].view_definition!, 'base64').toString('utf8')).toMatch(/note/);
        expect(meta.columns.some((c) => c.schema === 'pg_catalog' || c.schema === 'information_schema')).toBe(false);
    });

    it('reads table and column comments', () => {
        expect(meta.tables.find((t) => t.table === 'customers')?.comment).toBe('People who buy things');
        expect(col('public', 'customers', 'email').comment).toBe('Login email');
        expect(col('public', 'customers', 'id').comment).toBeNull();
    });

    it('reads column types, lengths, precision, nullability and defaults', () => {
        expect(col('public', 'customers', 'email')).toMatchObject({
            type: 'character varying',
            character_maximum_length: '120',
            nullable: false,
        });
        expect(col('public', 'customers', 'full_name')).toMatchObject({ type: 'text', nullable: true });
        expect(col('public', 'customers', 'balance')).toMatchObject({
            type: 'numeric',
            precision: { precision: 10, scale: 2 },
            default: '0',
        });
        expect(col('public', 'customers', 'created_at')).toMatchObject({
            type: 'timestamp without time zone',
            precision: { precision: 3, scale: null },
        });
        expect(col('shop', 'orders', 'note')).toMatchObject({ type: 'character', character_maximum_length: '8' });
        expect(col('shop', 'orders', 'status')).toMatchObject({ type: 'shop.order_status', default: "'new'::shop.order_status" });
        expect(col('shop', 'order_items', 'qty').default).toBe('1');
    });

    it('detects identity/serial columns and arrays', () => {
        expect(col('public', 'customers', 'id').is_identity).toBe(true);
        expect(col('shop', 'orders', 'id').is_identity).toBe(true); // serial -> nextval
        expect(col('shop', 'order_items', 'qty').is_identity).toBe(false);
        expect(col('public', 'customers', 'tags')).toMatchObject({ type: 'integer', is_array: true });
        expect(col('public', 'customers', 'email').is_array).toBe(false);
    });

    it('keeps column order', () => {
        const names = meta.columns
            .filter((c) => c.table === 'customers')
            .sort((a, b) => a.ordinal_position - b.ordinal_position)
            .map((c) => c.name);
        expect(names).toEqual(['id', 'email', 'full_name', 'balance', 'tags', 'created_at']);
    });

    it('reads primary keys, including composite keys in order', () => {
        const pk = (t: string) => meta.pk_info.filter((p) => p.table === t).map((p) => p.column);
        expect(pk('customers')).toEqual(['id']);
        expect(pk('orders')).toEqual(['id']);
        expect(pk('order_items')).toEqual(['order_id', 'line_no']);
        expect(meta.pk_info[0].pk_def).toMatch(/PRIMARY KEY/);
    });

    it('reads foreign keys with ON DELETE / ON UPDATE actions', () => {
        const fk = (name: string) => meta.fk_info.find((f) => f.foreign_key_name === name)!;
        expect(fk('orders_customer_fk')).toMatchObject({
            schema: 'shop',
            table: 'orders',
            column: 'customer_id',
            reference_schema: 'public',
            reference_table: 'customers',
            reference_column: 'id',
        });
        expect(fk('orders_customer_fk').fk_def).toMatch(/ON UPDATE SET NULL/);
        expect(fk('orders_customer_fk').fk_def).toMatch(/ON DELETE CASCADE/);
        expect(fk('items_order_fk').fk_def).toMatch(/ON DELETE RESTRICT/);
        expect(meta.fk_info).toHaveLength(2);
    });

    it('reads unique constraints and indexes with direction and expressions', () => {
        const idx = (name: string) => meta.indexes.filter((i) => i.name === name);
        expect(idx('customers_email_key')).toMatchObject([{ column: 'email', unique: true, direction: 'ASC' }]);
        expect(idx('orders_placed_idx')).toMatchObject([{ column: 'placed_at', unique: false, direction: 'DESC', index_type: 'btree' }]);
        expect(idx('customers_email_lower_idx')[0].column).toMatch(/lower/);
        const pkIdx = idx('order_items_pkey');
        expect(pkIdx.map((i) => i.column)).toEqual(['order_id', 'line_no']);
        expect(pkIdx.map((i) => i.column_position)).toEqual([1, 2]);
        expect(pkIdx.every((i) => i.unique)).toBe(true);
    });

    it('reads enum types', () => {
        expect(meta.custom_types).toEqual([
            { schema: 'shop', type: 'order_status', kind: 'enum', values: ['new', 'paid', 'shipped'] },
        ]);
    });

    it('lists the catalog per schema', async () => {
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        const cat = await new PostgresIntrospector(client).catalog();
        await client.end();
        expect(cat).toEqual([
            { schema: 'public', tables: ['customers'], views: [] },
            { schema: 'shop', tables: ['order_items', 'orders'], views: ['paid_orders'] },
        ]);
    });

    it('respects the schema filter', async () => {
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        const only = await new PostgresIntrospector(client).introspect({ schemas: ['shop'] });
        await client.end();
        expect(only.tables.every((t) => t.schema === 'shop')).toBe(true);
        expect(only.tables).toHaveLength(3); // two tables and the view
        // the FK into public.customers is still reported; filterMetadata drops it when a table is deselected
        expect(only.fk_info.map((f) => f.foreign_key_name).sort()).toEqual(['items_order_fk', 'orders_customer_fk']);
    });

    it('sends only read-only statements: every query passes the guard', () => {
        for (const [name, sql] of Object.entries(POSTGRES_QUERIES)) {
            expect(() => assertReadOnlySql(sql), name).not.toThrow();
        }
    });

    it('never sent a write: the recorded traffic is BEGIN READ ONLY, SET LOCAL, selects and ROLLBACK', () => {
        expect(sent.length).toBeGreaterThan(5);
        const control = new Set([
            'BEGIN READ ONLY',
            'ROLLBACK',
        ]);
        for (const sql of sent) {
            if (control.has(sql)) continue;
            if (/^SET LOCAL statement_timeout = \d+$/.test(sql)) continue;
            expect(() => assertReadOnlySql(sql), sql).not.toThrow();
        }
        expect(sent[0]).toBe('BEGIN READ ONLY');
        expect(sent.filter((s) => s === 'ROLLBACK')).toHaveLength(1);
    });

    it('leaves the database exactly as it found it', async () => {
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        const count = async () =>
            Number(
                (await client.query(
                    "select count(*) from pg_class where relnamespace not in (select oid from pg_namespace where nspname in ('pg_catalog','information_schema','pg_toast'))"
                )).rows[0].count
            );
        const before = await count();
        const second = await new PostgresIntrospector(client).introspect({ schemas: [] });
        expect(second.tables).toHaveLength(4);
        expect(await count()).toBe(before);
        await client.end();
    });
});

describe('read-only transaction protection', () => {
    it('lets PostgreSQL itself reject writes inside the transaction the driver uses', async () => {
        await resetSampleDatabase();
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        try {
            await withReadOnlyTransaction(client, async () => {
                await expect(client.query('CREATE TABLE sneaky (a int)')).rejects.toThrow(/read-only transaction/);
            });
            await withReadOnlyTransaction(client, async () => {
                await client.query('SELECT 1'); // transaction is usable again after the failure
            }).catch(() => undefined);
            const exists = await client.query("select to_regclass('public.sneaky') as t");
            expect(exists.rows[0].t).toBeNull();
        } finally {
            await client.end();
        }
    });

    it('rolls back and releases the transaction even when the work fails', async () => {
        const client = new pg.Client({ connectionString: SAMPLE_URL });
        await client.connect();
        try {
            await expect(
                withReadOnlyTransaction(client, async () => {
                    throw new Error('boom');
                })
            ).rejects.toThrow('boom');
            // a following write outside the helper works again, so no transaction is left open
            await client.query('CREATE TEMP TABLE ok_after (a int)');
        } finally {
            await client.end();
        }
    });
});

describe('connectPostgres', () => {
    it('connects through the vetted address and introspects', async () => {
        await resetSampleDatabase();
        const intro = await connectPostgres(params, { address: '127.0.0.1', family: 4 });
        try {
            const meta = await intro.introspect({ schemas: ['public'] });
            expect(meta.tables.map((t) => t.table)).toEqual(['customers']);
        } finally {
            await intro.close();
        }
    });

    it('fails clearly with wrong credentials', async () => {
        await expect(
            connectPostgres({ ...params, password: 'wrong' }, { address: '127.0.0.1', family: 4 })
        ).rejects.toThrow();
    });
});
