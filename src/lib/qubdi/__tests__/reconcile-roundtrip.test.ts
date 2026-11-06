import { describe, expect, it } from 'vitest';
import postgresSample from './fixtures/postgres-sample.json';
import sqlserverSample from './fixtures/sqlserver-sample.json';
import { metadataToDiagram } from '../import-from-db';
import { isEmpty, reconcile } from '../../../../shared/reconcile';
import {
    diagramToDesc,
    metadataToDesc,
    type MetadataLike,
} from '../../../../shared/schema-desc';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe.each([
    ['postgresql', postgresSample],
    ['sqlserver', sqlserverSample],
] as const)(
    '%s: a freshly imported diagram matches its source',
    (dialect, sample) => {
        const meta = sample as unknown as MetadataLike;

        it('reports no differences at all', async () => {
            const diagram = await metadataToDiagram(dialect, sample, 'x');
            const cs = reconcile(diagramToDesc(diagram), metadataToDesc(meta));
            expect(cs.changes.map((c) => c.id)).toEqual([]);
            expect(cs.possibleRenames).toEqual([]);
            expect(isEmpty(cs)).toBe(true);
        });

        it('matches every table, so layout and notes can be kept for all of them', async () => {
            const diagram = await metadataToDiagram(dialect, sample, 'x');
            const cs = reconcile(diagramToDesc(diagram), metadataToDesc(meta));
            expect(cs.matched).toHaveLength(diagram.tables!.length);
            expect(cs.matched.every((m) => m.diagramId)).toBe(true);
        });

        it('detects a column added in the database and nothing else', async () => {
            const diagram = await metadataToDiagram(dialect, sample, 'x');
            const changed = clone(meta) as MetadataLike & {
                columns: Array<Record<string, unknown>>;
            };
            const schemaName = meta.tables.find(
                (t) => t.table === 'customers'
            )!.schema;
            changed.columns.push({
                schema: schemaName,
                table: 'customers',
                name: 'phone',
                type: dialect === 'postgresql' ? 'text' : 'nvarchar',
                ordinal_position: 99,
                nullable: true,
                character_maximum_length:
                    dialect === 'postgresql' ? null : '30',
            });
            const cs = reconcile(
                diagramToDesc(diagram),
                metadataToDesc(changed)
            );
            expect(cs.changes.map((c) => c.id)).toEqual([
                `column_added:${schemaName}.customers.phone`,
            ]);
        });

        it('detects a retyped, now-nullable column', async () => {
            const diagram = await metadataToDiagram(dialect, sample, 'x');
            const changed = clone(meta) as MetadataLike & {
                columns: Array<Record<string, unknown>>;
            };
            const target = changed.columns.find(
                (c) => c.table === 'order_items' && c.name === 'sku'
            )!;
            target.type = 'text';
            target.character_maximum_length = null;
            target.nullable = true;
            const cs = reconcile(
                diagramToDesc(diagram),
                metadataToDesc(changed)
            );
            expect(cs.changes).toHaveLength(1);
            const change = cs.changes[0];
            expect(change.kind).toBe('column_changed');
            if (change.kind === 'column_changed') {
                expect(change.changes.map((f) => f.field).sort()).toEqual([
                    'length',
                    'nullable',
                    'type',
                ]);
            }
        });

        it('detects a dropped foreign key and a dropped table', async () => {
            const diagram = await metadataToDiagram(dialect, sample, 'x');
            const changed = clone(meta) as MetadataLike & {
                tables: Array<{ table: string }>;
                columns: Array<{ table: string }>;
            };
            changed.fk_info = changed.fk_info.filter(
                (f) => f.foreign_key_name !== 'items_order_fk'
            );
            changed.tables = changed.tables.filter(
                (t) => t.table !== 'order_items'
            );
            changed.columns = changed.columns.filter(
                (c) => c.table !== 'order_items'
            );
            changed.pk_info = changed.pk_info.filter(
                (p) => p.table !== 'order_items'
            );
            changed.indexes = changed.indexes.filter(
                (i) => i.table !== 'order_items'
            );
            const cs = reconcile(
                diagramToDesc(diagram),
                metadataToDesc(changed)
            );
            expect(cs.changes.map((c) => c.kind)).toEqual(['table_removed']);
        });
    }
);
