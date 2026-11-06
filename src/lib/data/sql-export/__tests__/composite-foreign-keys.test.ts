import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/qbase/diagram-types';
import { diagram, field, pk, relationship, table } from './builders';
import { exportBaseSQL } from './builders';

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
