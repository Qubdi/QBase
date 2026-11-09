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

describe('DBML export of a many-to-many relationship', () => {
    it('writes it as one-to-many and says so', () => {
        const b = new DesignBuilder({
            databaseType: 'postgresql',
            name: 'sample',
            now: Date.UTC(2026, 10, 7, 12, 0, 0),
            random: seededRandom(5),
            sort: false,
        });
        for (const name of ['a', 'b'])
            b.addTable({
                name,
                columns: [{ name: 'id', typeName: 'int', nullable: false }],
                indexes: [],
                checks: [],
            });
        b.addLink({
            name: 'a_b',
            from: { table: 'a', column: 'id' },
            to: { table: 'b', column: 'id' },
        });
        const built = b.build();
        // the builder never makes one; a design opened from a file can hold it
        const id = built.links.order[0];
        const design = {
            ...built,
            links: {
                ...built.links,
                byId: {
                    [id]: {
                        ...built.links.byId[id],
                        sourceCardinality: 'many' as const,
                        targetCardinality: 'many' as const,
                    },
                },
            },
        };
        const { diagnostics } = exportDbml(design);
        expect(diagnostics.map((d) => d.message)).toEqual([
            expect.stringContaining('many-to-many was written as one-to-many'),
        ]);
    });
});

describe('DBML export of what DBML cannot hold', () => {
    it('names each view and each partial-index condition it leaves out', () => {
        const b = new DesignBuilder({
            databaseType: 'postgresql',
            name: 'sample',
            now: Date.UTC(2026, 10, 7, 12, 0, 0),
            random: seededRandom(5),
            sort: false,
        });
        b.addTable({
            name: 'users',
            columns: [
                { name: 'id', typeName: 'int', nullable: false },
                { name: 'active', typeName: 'boolean', nullable: false },
            ],
            indexes: [
                {
                    name: 'only_active',
                    unique: false,
                    columns: ['id'],
                    where: 'active',
                },
            ],
            checks: [],
        });
        b.addTable({
            name: 'active_users',
            view: true,
            columns: [{ name: 'id', typeName: 'int', nullable: false }],
            indexes: [],
            checks: [],
        });
        const messages = exportDbml(b.build()).diagnostics.map(
            (d) => d.message
        );
        expect(messages).toEqual([
            'View active_users was left out: DBML has no views.',
            expect.stringContaining('only_active'),
        ]);
    });
});
