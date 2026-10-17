import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import {
    diagram,
    field,
    pk,
    relationship,
    table,
} from '../cross-dialect/convert/__tests__/builders';
import { collectForeignKeys } from '../foreign-keys';
import { exportBaseSQL } from '../export-sql-script';

const keys = (d: ReturnType<typeof diagram>, verifyReferences = false) =>
    collectForeignKeys({
        tables: d.tables ?? [],
        relationships: d.relationships,
        verifyReferences,
    });
const names = (fields: Array<{ name: string }>) => fields.map((f) => f.name);

describe('collecting the foreign keys of a diagram', () => {
    const lines = table('lines', [pk('order_id', 'int'), pk('no', 'int')]);
    const notes = table('notes', [
        pk('id', 'int'),
        field('order_id', 'int'),
        field('no', 'int'),
    ]);
    const orders = table('orders', [pk('id', 'int')]);
    const link = (name: string, i: number, j: number) =>
        relationship(name, [lines, lines.fields[i]], [notes, notes.fields[j]]);

    it('holds the key on the many side, pointing at the one side', () => {
        const d = diagram(
            DatabaseType.MYSQL,
            [orders, notes],
            [
                relationship(
                    'fk',
                    [orders, orders.fields[0]],
                    [notes, notes.fields[1]]
                ),
            ]
        );
        const [k] = keys(d);
        expect(k.fkTable.name).toBe('notes');
        expect(names(k.fkFields)).toEqual(['order_id']);
        expect(k.refTable.name).toBe('orders');
        expect(names(k.refFields)).toEqual(['id']);
        expect(k.name).toBe('fk');
    });

    it('reads a many-to-one the other way round: the source holds the key', () => {
        const d = diagram(
            DatabaseType.MYSQL,
            [orders, notes],
            [
                relationship(
                    'fk',
                    [notes, notes.fields[1]],
                    [orders, orders.fields[0]],
                    {
                        sourceCardinality: 'many',
                        targetCardinality: 'one',
                    }
                ),
            ]
        );
        expect(keys(d)[0].fkTable.name).toBe('notes');
    });

    it('puts the relationships of a composite key back together, in primary key order', () => {
        // listed in the opposite order to the key
        const d = diagram(
            DatabaseType.MYSQL,
            [lines, notes],
            [link('fk_a', 1, 2), link('fk_a', 0, 1)]
        );
        const all = keys(d);
        expect(all).toHaveLength(1);
        expect(names(all[0].refFields)).toEqual(['order_id', 'no']);
        expect(names(all[0].fkFields)).toEqual(['order_id', 'no']);
        expect(all[0].name).toBe('fk_a');
    });

    it('leaves a composite key without a name when its parts had different names', () => {
        const d = diagram(
            DatabaseType.MYSQL,
            [lines, notes],
            [link('fk_a', 0, 1), link('fk_b', 1, 2)]
        );
        expect(keys(d)[0].name).toBe('');
    });

    it('keeps them apart when they do not cover the whole key', () => {
        const d = diagram(
            DatabaseType.MYSQL,
            [lines, notes],
            [link('fk_a', 0, 1)]
        );
        expect(keys(d)).toHaveLength(1);
        expect(names(keys(d)[0].refFields)).toEqual(['order_id']);
    });

    it('keeps the order of the relationships', () => {
        const c = table('c', [pk('id', 'int')]);
        const a = table('a', [field('c_id', 'int')]);
        const b = table('b', [field('c_id', 'int')]);
        const d = diagram(
            DatabaseType.MYSQL,
            [c, a, b],
            [
                relationship('to_b', [c, c.fields[0]], [b, b.fields[0]]),
                relationship('to_a', [c, c.fields[0]], [a, a.fields[0]]),
            ]
        );
        expect(keys(d).map((k) => k.name)).toEqual(['to_b', 'to_a']);
    });

    it('skips views and relationships whose table or column is gone', () => {
        const view = table('v', [field('order_id', 'int')], { isView: true });
        const d = diagram(
            DatabaseType.MYSQL,
            [orders, view],
            [
                relationship(
                    'to_view',
                    [orders, orders.fields[0]],
                    [view, view.fields[0]]
                ),
                relationship(
                    'gone',
                    [orders, orders.fields[0]],
                    [notes, notes.fields[1]]
                ),
            ]
        );
        expect(keys(d)).toEqual([]);
    });

    it('reads a many-to-many as the foreign key it has to be', () => {
        const d = diagram(
            DatabaseType.MYSQL,
            [orders, notes],
            [
                relationship(
                    'fk',
                    [orders, orders.fields[0]],
                    [notes, notes.fields[1]],
                    {
                        sourceCardinality: 'many',
                        targetCardinality: 'many',
                    }
                ),
            ]
        );
        expect(keys(d)[0].fkTable.name).toBe('notes');
    });

    describe('when asked to check what the key points at', () => {
        it('accepts a primary key, a unique column and a unique index', () => {
            const byUnique = table('u', [
                pk('id', 'int'),
                field('code', 'varchar', { unique: true }),
            ]);
            const byIndex = table('i', [
                pk('id', 'int'),
                field('code', 'varchar'),
            ]);
            byIndex.indexes = [
                {
                    id: 'x',
                    name: 'x',
                    unique: true,
                    fieldIds: [byIndex.fields[1].id],
                    createdAt: 1,
                },
            ];
            const child = table('child', [
                field('a', 'int'),
                field('b', 'varchar'),
                field('c', 'varchar'),
            ]);
            const d = diagram(
                DatabaseType.MYSQL,
                [orders, byUnique, byIndex, child],
                [
                    relationship(
                        'p',
                        [orders, orders.fields[0]],
                        [child, child.fields[0]]
                    ),
                    relationship(
                        'u',
                        [byUnique, byUnique.fields[1]],
                        [child, child.fields[1]]
                    ),
                    relationship(
                        'i',
                        [byIndex, byIndex.fields[1]],
                        [child, child.fields[2]]
                    ),
                ]
            );
            expect(keys(d, true).map((k) => k.problem)).toEqual([
                undefined,
                undefined,
                undefined,
            ]);
        });

        it('explains a key to a column that is not unique', () => {
            const parent = table('parent', [field('code', 'varchar')]);
            const child = table('child', [field('code', 'varchar')]);
            const d = diagram(
                DatabaseType.MYSQL,
                [parent, child],
                [
                    relationship(
                        'fk',
                        [parent, parent.fields[0]],
                        [child, child.fields[0]]
                    ),
                ]
            );
            expect(keys(d, true)[0].problem).toBe(
                'parent.code is not unique, and no database accepts a foreign key to a column that is not'
            );
            expect(keys(d)[0].problem).toBeUndefined();
        });

        it('explains a key to part of a composite key', () => {
            const d = diagram(
                DatabaseType.MYSQL,
                [lines, notes],
                [link('fk_a', 0, 1)]
            );
            expect(keys(d, true)[0].problem).toMatch(
                /only part of a composite key/
            );
        });
    });
});

describe('exporting a composite foreign key', () => {
    const lines = table('lines', [pk('order_id', 'int'), pk('no', 'int')]);
    const notes = table('notes', [
        pk('id', 'int'),
        field('order_id', 'int'),
        field('no', 'int'),
    ]);
    const d = (type: DatabaseType) =>
        diagram(
            type,
            [lines, notes],
            [
                relationship(
                    'fk_a',
                    [lines, lines.fields[0]],
                    [notes, notes.fields[1]]
                ),
                relationship(
                    'fk_a',
                    [lines, lines.fields[1]],
                    [notes, notes.fields[2]]
                ),
            ]
        );

    it.each([
        [
            DatabaseType.POSTGRESQL,
            /FOREIGN KEY\("order_id", "no"\) REFERENCES "lines"\("order_id", "no"\)/,
        ],
        [
            DatabaseType.MYSQL,
            /FOREIGN KEY\(`order_id`, `no`\) REFERENCES `lines`\(`order_id`, `no`\)/,
        ],
        [
            DatabaseType.SQL_SERVER,
            /ADD CONSTRAINT \[fk_a\] FOREIGN KEY\(\[order_id\], \[no\]\) REFERENCES \[lines\]\(\[order_id\], \[no\]\)/,
        ],
        [
            DatabaseType.SQLITE,
            /FOREIGN KEY\("order_id", "no"\) REFERENCES "lines"\("order_id", "no"\)/,
        ],
    ])('writes one constraint over both columns in %s', (type, pattern) => {
        const sql = exportBaseSQL({
            diagram: d(type),
            targetDatabaseType: type,
        });
        expect(sql).toMatch(pattern);
        expect(sql.match(/FOREIGN KEY/g)).toHaveLength(1);
    });
});
