import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from '@/formats/shared/design-builder';
import { applyFilter, exportSql } from './export-sql';

const design = () => {
    const b = new DesignBuilder({
        databaseType: 'postgresql',
        name: 'sample',
        now: Date.UTC(2026, 10, 7, 12, 0, 0),
        random: seededRandom(5),
        sort: false,
    });
    for (const name of ['hub', 'a', 'b', 'c'])
        b.addTable({
            name,
            columns: [{ name: 'id', typeName: 'int', nullable: false }],
            indexes: [],
            checks: [],
        });
    for (const to of ['a', 'b', 'c'])
        b.addLink({
            name: `fk_${to}`,
            from: { table: 'hub', column: 'id' },
            to: { table: to, column: 'id' },
        });
    return b.build();
};

describe('applyFilter', () => {
    it('keeps the tables the filter shows and the links between them', () => {
        const d = design();
        const names = (x: typeof d) =>
            x.entities.order.map((id) => x.entities.byId[id].name);
        const keep = d.entities.order
            .filter((id) => ['hub', 'a'].includes(d.entities.byId[id].name))
            .map((id) => id);
        const out = applyFilter(d, { tableIds: keep });
        expect(names(out)).toEqual(['hub', 'a']);
        expect(out.links.order).toHaveLength(1);
        expect(Object.keys(out.links.byId)).toEqual(out.links.order);
        // the input is left alone
        expect(d.links.order).toHaveLength(3);
    });

    it('drops every link when only unrelated tables are shown', () => {
        const d = design();
        const only = d.entities.order.filter(
            (id) => d.entities.byId[id].name === 'b'
        );
        const out = applyFilter(d, { tableIds: only });
        expect(out.links.order).toEqual([]);
        expect(out.links.byId).toEqual({});
    });

    it('returns the same design when nothing is hidden', () => {
        const d = design();
        expect(applyFilter(d, { tableIds: [...d.entities.order] })).toBe(d);
    });
});

describe('exportSql in the same dialect', () => {
    it('says how many views it did not write', () => {
        const b = new DesignBuilder({
            databaseType: 'postgresql',
            name: 'sample',
            now: Date.UTC(2026, 10, 7, 12, 0, 0),
            random: seededRandom(5),
            sort: false,
        });
        for (const [name, view] of [
            ['t', false],
            ['v1', true],
            ['v2', true],
        ] as const)
            b.addTable({
                name,
                view,
                columns: [{ name: 'id', typeName: 'int', nullable: false }],
                indexes: [],
                checks: [],
            });
        const { diagnostics } = exportSql(b.build(), 'postgresql');
        expect(diagnostics.map((d) => d.message)).toEqual([
            '2 views not exported: only tables are written',
        ]);
    });
});
