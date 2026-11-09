import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from '@/formats/shared/design-builder';
import { exportDbml } from './export-dbml';

const withExpressions = () => {
    const b = new DesignBuilder({
        databaseType: 'mysql',
        name: 'sample',
        now: Date.UTC(2026, 10, 7, 12, 0, 0),
        random: seededRandom(5),
        sort: false,
    });
    b.addTable({
        name: 'items',
        columns: [
            {
                name: 'label',
                typeName: 'varchar',
                length: 20,
                nullable: true,
                default: 'concat(`a`, `b`)',
            },
            { name: 'qty', typeName: 'int', nullable: true },
        ],
        indexes: [],
        checks: ['`qty` > 0'],
    });
    return b.build();
};

describe('DBML export of an expression with backticks', () => {
    it('removes them, as DBML cannot hold one, and says so', () => {
        const { text, diagnostics } = exportDbml(withExpressions());
        expect(text).toContain('default: `concat(a, b)`');
        expect(text).toContain('`qty > 0`');
        const messages = diagnostics.map((d) => d.message);
        expect(messages.some((m) => /field label.*backtick/.test(m))).toBe(
            true
        );
        expect(messages.some((m) => /backtick in a CHECK/.test(m))).toBe(true);
    });

    it('stays quiet for an expression with none', () => {
        const b = new DesignBuilder({
            databaseType: 'postgresql',
            name: 'sample',
            now: Date.UTC(2026, 10, 7, 12, 0, 0),
            random: seededRandom(5),
            sort: false,
        });
        b.addTable({
            name: 'items',
            columns: [
                {
                    name: 'at',
                    typeName: 'timestamp',
                    nullable: true,
                    default: 'now()',
                },
            ],
            indexes: [],
            checks: ['at IS NOT NULL'],
        });
        expect(exportDbml(b.build()).diagnostics).toEqual([]);
    });
});
