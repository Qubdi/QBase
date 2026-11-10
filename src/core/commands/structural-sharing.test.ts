import { describe, expect, it } from 'vitest';
import type { Design } from '../model/design';
import { applyOk, NOW, rng } from '../testing/helpers';
import { parse } from '../wire/parse';
import { shop } from '../wire/fixtures/shop';
import { planUpdateColumn } from './plan-column';
import type { Command } from './command';

const design = (): Design => parse(shop, { now: NOW, random: rng() }).design;

describe('an edit copies only what it changes (large diagrams)', () => {
    const base = design();
    const id = base.entities.order[0];
    const entity = base.entities.byId[id];

    it('renaming or moving a table keeps the column, index and check maps', () => {
        const commands: Command[] = [
            { type: 'entity.update', id, patch: { name: 'renamed_table' } },
            { type: 'entity.update', id, patch: { x: 123, y: 456 } },
            {
                type: 'entity.move',
                moves: [{ id, x: entity.x + 10, y: entity.y + 10 }],
            },
        ];
        for (const command of commands) {
            const next = applyOk(base, command).design;
            expect(next).not.toBe(base);
            expect(next.columns).toBe(base.columns);
            expect(next.keys).toBe(base.keys);
            expect(next.rules).toBe(base.rules);
            expect(next.links).toBe(base.links);
        }
    });

    it('editing a column replaces the column map and leaves the others', () => {
        const columnId = entity.columnIds[0];
        const command = planUpdateColumn(id, columnId, { name: 'other_name' });
        const next = applyOk(base, command).design;
        expect(next.columns).not.toBe(base.columns);
        expect(next.columns[columnId].name).toBe('other_name');
        expect(next.rules).toBe(base.rules);
        expect(next.links).toBe(base.links);
    });
});
