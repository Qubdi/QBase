import { beforeEach, describe, expect, it } from 'vitest';
import postgresSample from './fixtures/postgres-sample.json';
import { metadataToDiagram } from '../import-from-db';
import {
    applyResync,
    effectiveSelection,
    planResync,
    snapshotSourceKeys,
} from '../resync';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { Diagram } from '@/qbase/diagram-types';
import { estimateBox } from '../placement';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const base = postgresSample as unknown as DatabaseMetadata;

let diagram: Diagram;
let meta: DatabaseMetadata;

const table = (d: Diagram, name: string) =>
    d.tables!.find((t) => t.name === name)!;
const ids = (cs: ReturnType<typeof planResync>) => cs.changes.map((c) => c.id);
const everything = (cs: ReturnType<typeof planResync>) =>
    new Set(cs.changes.map((c) => c.id));

/** What a person does to an imported diagram: arrange it, colour it, annotate it. */
async function decoratedDiagram(): Promise<Diagram> {
    const d = await metadataToDiagram('postgresql', base, 'Shop');
    d.tables!.forEach((t, i) => {
        t.x = 100 + i * 500;
        t.y = 80 + i * 40;
        t.color = `#00${i}0ff`;
    });
    table(d, 'customers').comments = 'Our customers';
    table(d, 'customers').fields[1].comments = 'Login email';
    (d as unknown as Record<string, unknown>).areas = [
        {
            id: 'area1',
            name: 'Core',
            x: 0,
            y: 0,
            width: 900,
            height: 500,
            color: '#abc',
        },
    ];
    (d as unknown as Record<string, unknown>).notes = [
        {
            id: 'note1',
            content: 'remember',
            x: 10,
            y: 10,
            width: 100,
            height: 50,
            color: '#fff',
        },
    ];
    return d;
}

beforeEach(async () => {
    diagram = await decoratedDiagram();
    meta = clone(base);
});

const addColumn = (
    m: DatabaseMetadata,
    schema: string,
    tableName: string,
    name: string,
    type = 'text',
    extra: Record<string, unknown> = {}
) =>
    m.columns.push({
        schema,
        table: tableName,
        name,
        type,
        ordinal_position: 99,
        nullable: true,
        ...extra,
    } as DatabaseMetadata['columns'][number]);

describe('planning', () => {
    it('finds nothing when the database has not changed', () => {
        const cs = planResync(diagram, meta);
        expect(ids(cs)).toEqual([]);
    });

    it('finds exactly an added column', () => {
        addColumn(meta, 'public', 'customers', 'phone');
        expect(ids(planResync(diagram, meta))).toEqual([
            'column_added:public.customers.phone',
        ]);
    });
});

describe('applying changes keeps what the user built', () => {
    const untouched = (before: Diagram, after: Diagram, names: string[]) => {
        for (const n of names) {
            const a = table(before, n);
            const b = table(after, n);
            expect(b.id).toBe(a.id);
            expect([b.x, b.y, b.color]).toEqual([a.x, a.y, a.color]);
        }
    };

    it('adds a new column without disturbing layout, colours, areas, notes or comments', async () => {
        addColumn(meta, 'public', 'customers', 'phone', 'text');
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );

        const customers = table(out, 'customers');
        const phone = customers.fields.find((f) => f.name === 'phone')!;
        expect(phone).toBeDefined();
        expect(phone.type.name).toBe('text');
        expect(customers.fields.map((f) => f.name)).toContain('email');
        expect(customers.comments).toBe('Our customers');
        expect(customers.fields[1].comments).toBe('Login email');
        untouched(diagram, out, ['customers', 'orders', 'order_items']);
        expect((out as unknown as Record<string, unknown>).areas).toEqual(
            (diagram as unknown as Record<string, unknown>).areas
        );
        expect((out as unknown as Record<string, unknown>).notes).toEqual(
            (diagram as unknown as Record<string, unknown>).notes
        );
        expect(out.relationships).toEqual(diagram.relationships);
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('never mutates the diagram it was given', async () => {
        addColumn(meta, 'public', 'customers', 'phone');
        meta.tables = meta.tables.filter((t) => t.table !== 'order_items');
        const snapshot = JSON.stringify(diagram);
        const cs = planResync(diagram, meta);
        await applyResync(diagram, meta, 'postgresql', cs, everything(cs));
        expect(JSON.stringify(diagram)).toBe(snapshot);
    });

    it('applies attribute changes to a column but keeps its id and untouched attributes', async () => {
        const email = meta.columns.find(
            (c) => c.table === 'customers' && c.name === 'email'
        )!;
        email.type = 'text';
        email.character_maximum_length = null;
        email.nullable = true;
        const before = table(diagram, 'customers').fields.find(
            (f) => f.name === 'email'
        )!;
        const cs = planResync(diagram, meta);
        expect(ids(cs)).toEqual(['column_changed:public.customers.email']);

        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        const after = table(out, 'customers').fields.find(
            (f) => f.name === 'email'
        )!;
        expect(after.id).toBe(before.id);
        expect(after.type.name).toBe('text');
        expect(after.nullable).toBe(true);
        expect(after.characterMaximumLength).toBeUndefined();
        expect(after.comments).toBe('Login email'); // not one of the changed attributes
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('removes a dropped column together with the relationship that used it', async () => {
        meta.columns = meta.columns.filter(
            (c) => !(c.table === 'orders' && c.name === 'customer_id')
        );
        meta.fk_info = meta.fk_info.filter(
            (f) => f.foreign_key_name !== 'orders_customer_fk'
        );
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        expect(table(out, 'orders').fields.map((f) => f.name)).not.toContain(
            'customer_id'
        );
        expect(out.relationships!.map((r) => r.name)).toEqual([
            'items_order_fk',
        ]);
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('removes a dropped table with its relationships and leaves the others alone', async () => {
        meta.tables = meta.tables.filter((t) => t.table !== 'order_items');
        for (const key of ['columns', 'pk_info', 'indexes'] as const) {
            (meta[key] as Array<{ table: string }>) = (
                meta[key] as Array<{ table: string }>
            ).filter((x) => x.table !== 'order_items');
        }
        meta.fk_info = meta.fk_info.filter((f) => f.table !== 'order_items');
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        expect(out.tables!.map((t) => t.name).sort()).toEqual([
            'customers',
            'orders',
            'paid_orders',
        ]);
        expect(out.relationships!.map((r) => r.name)).toEqual([
            'orders_customer_fk',
        ]);
        untouched(diagram, out, ['customers', 'orders']);
    });

    it('adds a new table near the tables it relates to, without overlap, and links it', async () => {
        meta.tables.push({
            schema: 'shop',
            table: 'payments',
            type: 'BASE TABLE',
        });
        addColumn(meta, 'shop', 'payments', 'id', 'integer', {
            ordinal_position: 1,
            nullable: false,
        });
        addColumn(meta, 'shop', 'payments', 'order_id', 'integer', {
            ordinal_position: 2,
            nullable: false,
        });
        meta.pk_info.push({
            schema: 'shop',
            table: 'payments',
            column: 'id',
            pk_def: 'PRIMARY KEY (id)',
        });
        meta.fk_info.push({
            schema: 'shop',
            table: 'payments',
            column: 'order_id',
            foreign_key_name: 'payments_order_fk',
            reference_schema: 'shop',
            reference_table: 'orders',
            reference_column: 'id',
            fk_def: 'FOREIGN KEY (order_id) REFERENCES shop.orders (id)',
        });
        const cs = planResync(diagram, meta);
        expect(ids(cs).sort()).toEqual([
            'relationship_added:shop.payments.payments_order_fk.order_id',
            'table_added:shop.payments',
        ]);

        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        const payments = table(out, 'payments');
        const orders = table(out, 'orders');
        expect(payments).toBeDefined();
        expect(
            out.relationships!.some((r) => r.name === 'payments_order_fk')
        ).toBe(true);

        const box = estimateBox(payments);
        for (const t of out.tables!.filter((x) => x.id !== payments.id)) {
            const o = estimateBox(t);
            const separate =
                box.x + box.width <= o.x ||
                o.x + o.width <= box.x ||
                box.y + box.height <= o.y ||
                o.y + o.height <= box.y;
            expect(separate, `overlaps ${t.name}`).toBe(true);
        }
        // closer to the related table than to the far-away customers table
        const dist = (
            a: { x: number; y: number },
            b: { x: number; y: number }
        ) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist(payments, orders)).toBeLessThan(
            dist(payments, table(out, 'customers')) + 1
        );
        untouched(diagram, out, ['customers', 'orders', 'order_items']);
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('adds a new unrelated table out of the way', async () => {
        meta.tables.push({
            schema: 'shop',
            table: 'audit',
            type: 'BASE TABLE',
        });
        addColumn(meta, 'shop', 'audit', 'id', 'integer', {
            ordinal_position: 1,
            nullable: false,
        });
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        const audit = table(out, 'audit');
        const rightEdge = Math.max(
            ...diagram.tables!.map((t) => t.x + estimateBox(t).width)
        );
        expect(audit.x).toBeGreaterThanOrEqual(rightEdge);
    });

    it('adds and removes indexes', async () => {
        meta.indexes.push({
            schema: 'shop',
            table: 'orders',
            name: 'orders_customer_idx',
            column: 'customer_id',
            index_type: 'btree',
            unique: false,
            direction: 'ASC',
            column_position: 1,
        });
        meta.indexes = meta.indexes.filter(
            (i) => i.name !== 'orders_placed_idx'
        );
        const cs = planResync(diagram, meta);
        expect(ids(cs).sort()).toEqual([
            'index_added:shop.orders.orders_customer_idx',
            'index_removed:shop.orders.orders_placed_idx',
        ]);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        const names = table(out, 'orders').indexes.map((i) => i.name);
        expect(names).toContain('orders_customer_idx');
        expect(names).not.toContain('orders_placed_idx');
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('keeps descriptions written in the diagram and never reports them as changes', async () => {
        meta.tables.find((t) => t.table === 'customers')!.comment =
            'Paying people';
        meta.columns.find(
            (c) => c.table === 'customers' && c.name === 'email'
        )!.comment = 'Primary email';
        const cs = planResync(diagram, meta);
        expect(ids(cs)).toEqual([]);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        expect(table(out, 'customers').comments).toBe('Our customers');
        expect(table(out, 'customers').fields[1].comments).toBe('Login email');
    });
});

describe('selective apply', () => {
    it('applies only the checked changes and leaves the rest for next time', async () => {
        addColumn(meta, 'public', 'customers', 'phone');
        addColumn(meta, 'shop', 'orders', 'coupon', 'text');
        const cs = planResync(diagram, meta);
        expect(ids(cs).sort()).toEqual([
            'column_added:public.customers.phone',
            'column_added:shop.orders.coupon',
        ]);

        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            new Set(['column_added:public.customers.phone'])
        );
        expect(
            table(out, 'customers').fields.some((f) => f.name === 'phone')
        ).toBe(true);
        expect(
            table(out, 'orders').fields.some((f) => f.name === 'coupon')
        ).toBe(false);
        expect(ids(planResync(out, meta))).toEqual([
            'column_added:shop.orders.coupon',
        ]);
    });

    it('does nothing for an empty selection', async () => {
        addColumn(meta, 'public', 'customers', 'phone');
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            new Set()
        );
        expect(out.tables).toEqual(diagram.tables);
    });

    it('ignores ids that are not in the plan', async () => {
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            new Set(['table_removed:nope'])
        );
        expect(out.tables).toEqual(diagram.tables);
    });
});

describe('renames', () => {
    const renameOrders = () => {
        for (const key of [
            'tables',
            'columns',
            'pk_info',
            'indexes',
        ] as const) {
            for (const x of meta[key] as Array<{
                schema: string;
                table: string;
            }>) {
                if (x.schema === 'shop' && x.table === 'orders')
                    x.table = 'purchases';
            }
        }
        for (const f of meta.fk_info) {
            if (f.table === 'orders') f.table = 'purchases';
            if (f.reference_table === 'orders') f.reference_table = 'purchases';
        }
    };

    it('offers a rename instead of silently deleting and recreating', () => {
        renameOrders();
        const cs = planResync(diagram, meta);
        expect(cs.possibleRenames.map((r) => r.id)).toEqual([
            'rename_table:shop.orders->shop.purchases',
        ]);
        expect(ids(cs)).toEqual(
            expect.arrayContaining([
                'table_added:shop.purchases',
                'table_removed:shop.orders',
            ])
        );
    });

    it('keeps id, position, colour and relationships when the rename is accepted', async () => {
        renameOrders();
        const cs = planResync(diagram, meta);
        const before = table(diagram, 'orders');
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            new Set([cs.possibleRenames[0].id])
        );
        const after = table(out, 'purchases');
        expect(after.id).toBe(before.id);
        expect([after.x, after.y, after.color]).toEqual([
            before.x,
            before.y,
            before.color,
        ]);
        expect(out.tables!.some((t) => t.name === 'orders')).toBe(false);
        expect(out.relationships).toHaveLength(2);
        expect(ids(planResync(out, meta))).toEqual([]);
    });

    it('treats an unaccepted rename as plain remove + add', async () => {
        renameOrders();
        const cs = planResync(diagram, meta);
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            everything(cs)
        );
        expect(out.tables!.some((t) => t.name === 'orders')).toBe(false);
        expect(table(out, 'purchases').id).not.toBe(
            table(diagram, 'orders').id
        );
    });

    it('applies a column rename in place', async () => {
        const col = meta.columns.find(
            (c) => c.table === 'order_items' && c.name === 'sku'
        )!;
        col.name = 'product_code';
        const cs = planResync(diagram, meta);
        expect(cs.possibleRenames.map((r) => r.id)).toEqual([
            'rename_column:shop.order_items.sku->product_code',
        ]);
        const before = table(diagram, 'order_items').fields.find(
            (f) => f.name === 'sku'
        )!;
        const out = await applyResync(
            diagram,
            meta,
            'postgresql',
            cs,
            new Set([cs.possibleRenames[0].id])
        );
        const after = table(out, 'order_items').fields.find(
            (f) => f.name === 'product_code'
        )!;
        expect(after.id).toBe(before.id);
        expect(ids(planResync(out, meta))).toEqual([]);
    });
});

describe('stored source identity', () => {
    it('keeps a locally renamed table matched', async () => {
        const keys = snapshotSourceKeys(diagram, meta);
        const local = table(diagram, 'customers');
        local.name = 'clients';
        expect(ids(planResync(diagram, meta))).not.toEqual([]); // without identity it looks like drift
        expect(ids(planResync(diagram, meta, keys))).toEqual([]);
        expect(keys.tables[local.id]).toBe('public.customers');
    });

    it('remembers every matched column too', () => {
        const keys = snapshotSourceKeys(diagram, meta);
        const email = table(diagram, 'customers').fields.find(
            (f) => f.name === 'email'
        )!;
        expect(keys.columns[email.id]).toBe('email');
        expect(Object.keys(keys.tables)).toHaveLength(diagram.tables!.length);
    });

    it('keeps following a column renamed locally', () => {
        const keys = snapshotSourceKeys(diagram, meta);
        const email = table(diagram, 'customers').fields.find(
            (f) => f.name === 'email'
        )!;
        email.name = 'mail';
        expect(ids(planResync(diagram, meta, keys))).toEqual([]);
        expect(snapshotSourceKeys(diagram, meta, keys).columns[email.id]).toBe(
            'email'
        );
    });
});

describe('effectiveSelection', () => {
    it('swaps a removed+added pair for the rename and brings its follow-ups', () => {
        const col = meta.columns.find(
            (c) => c.table === 'order_items' && c.name === 'sku'
        )!;
        col.name = 'product_code';
        col.nullable = true;
        const cs = planResync(diagram, meta);
        const rename = cs.possibleRenames[0];
        const eff = effectiveSelection(cs, new Set([rename.id, ...ids(cs)]));
        expect(eff.renames).toHaveLength(1);
        const kinds = eff.changes.map((c) => c.id);
        expect(kinds).not.toContain('column_removed:shop.order_items.sku');
        expect(kinds).not.toContain(
            'column_added:shop.order_items.product_code'
        );
        expect(kinds).toContain('column_changed:shop.order_items.sku');
    });

    it('passes selected changes through unchanged when no rename is accepted', () => {
        addColumn(meta, 'public', 'customers', 'phone');
        const cs = planResync(diagram, meta);
        expect(effectiveSelection(cs, everything(cs)).changes).toHaveLength(1);
        expect(effectiveSelection(cs, new Set()).changes).toHaveLength(0);
    });
});
