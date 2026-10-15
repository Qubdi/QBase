import { describe, expect, it } from 'vitest';
import type { DBField } from '@/lib/domain/db-field';
import type { DBTable } from '@/lib/domain/db-table';
import type { ForeignKeyInfo } from '../../metadata-types/foreign-key-info';
import { createRelationshipsFromMetadata } from '../relationships';

const field = (name: string, over: Partial<DBField> = {}): DBField =>
    ({
        id: `f-${name}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        type: { id: 'integer', name: 'integer' },
        primaryKey: false,
        unique: false,
        nullable: false,
        createdAt: 1,
        ...over,
    }) as DBField;

const table = (name: string, fields: DBField[]): DBTable =>
    ({
        id: `t-${name}`,
        name,
        schema: 'public',
        fields,
        indexes: [],
        x: 0,
        y: 0,
        color: '#3b82f6',
        isView: false,
        createdAt: 1,
        order: 0,
    }) as DBTable;

const fk = (
    from: string,
    column: string,
    to: string,
    refColumn: string,
    name: string
): ForeignKeyInfo => ({
    schema: 'public',
    table: from,
    column,
    foreign_key_name: name,
    reference_schema: 'public',
    reference_table: to,
    reference_column: refColumn,
    fk_def: '',
});

describe('relationships read from a database', () => {
    const customers = table('customers', [field('id', { primaryKey: true })]);
    const orders = table('orders', [
        field('id', { primaryKey: true }),
        field('customer_id'),
    ]);
    // the primary key of order_lines is the pair (order_id, line_no)
    const lines = table('order_lines', [
        field('order_id', { primaryKey: true }),
        field('line_no', { primaryKey: true }),
    ]);
    const notes = table('line_notes', [
        field('id', { primaryKey: true }),
        field('order_id'),
        field('line_no'),
    ]);
    const tables = [customers, orders, lines, notes];

    const read = (foreignKeys: ForeignKeyInfo[]) =>
        createRelationshipsFromMetadata({ foreignKeys, tables });
    const cardinalities = (rels: ReturnType<typeof read>) =>
        rels.map((r) => `${r.sourceCardinality}:${r.targetCardinality}`);

    it('reads a plain foreign key as one to many: the referenced table is the one', () => {
        const [rel] = read([
            fk('orders', 'customer_id', 'customers', 'id', 'fk_customer'),
        ]);
        expect(rel.sourceTableId).toBe(customers.id);
        expect(rel.targetTableId).toBe(orders.id);
        expect(cardinalities([rel])).toEqual(['one:many']);
    });

    it('does not make a many-to-many of a foreign key that uses a composite key', () => {
        const rels = read([
            fk('line_notes', 'order_id', 'order_lines', 'order_id', 'fk_a'),
            fk('line_notes', 'line_no', 'order_lines', 'line_no', 'fk_b'),
        ]);
        expect(rels).toHaveLength(2);
        expect(cardinalities(rels)).toEqual(['one:many', 'one:many']);
        // and the key stays on the table that holds it
        for (const rel of rels) {
            expect(rel.sourceTableId).toBe(lines.id);
            expect(rel.targetTableId).toBe(notes.id);
        }
    });

    it('never produces a many-to-many, whatever the keys look like', () => {
        const rels = read([
            fk('orders', 'customer_id', 'customers', 'id', 'a'),
            fk('line_notes', 'order_id', 'order_lines', 'order_id', 'b'),
            fk('line_notes', 'line_no', 'order_lines', 'line_no', 'c'),
            fk('order_lines', 'order_id', 'orders', 'id', 'd'),
        ]);
        expect(rels).toHaveLength(4);
        expect(cardinalities(rels)).not.toContain('many:many');
    });
});
