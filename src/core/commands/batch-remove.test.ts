import { describe, expect, it } from 'vitest';
import type { Design } from '../model/design';
import { applyOk, NOW, rng, sameButDate } from '../testing/helpers';
import { parse } from '../wire/parse';
import { shop } from '../wire/fixtures/shop';
import { apply } from './apply';
import type { Command } from './command';
import { planDeleteEntities } from './plan-entity';

const shopDesign = (): Design =>
    parse(shop, { now: NOW, random: rng() }).design;

/** the reference: one `entity.remove` after the other, each on its own */
function oneByOne(design: Design, ids: string[]) {
    let current = design;
    const inverses: Command[] = [];
    for (const id of ids) {
        const step = applyOk(current, { type: 'entity.remove', id });
        current = step.design;
        inverses.unshift(step.inverse);
    }
    return { design: current, inverses };
}

describe('deleting many tables in one pass (core-store review 11)', () => {
    const base = shopDesign();
    const all = base.entities.order.slice();
    const orders: [string, string[]][] = [
        ['all, in list order', all],
        ['all, reversed', all.slice().reverse()],
        ['every other one', all.filter((_, i) => i % 2 === 0)],
        ['two that share a link', all.slice(0, 2)],
        ['a single table', all.slice(0, 1)],
    ];

    for (const [name, ids] of orders) {
        it(`${name}: same design and same inverses as one by one`, () => {
            const reference = oneByOne(base, ids);
            const batch = applyOk(base, { ...planDeleteEntities(ids) });
            expect(sameButDate(batch.design, reference.design)).toEqual(
                reference.design
            );
            expect(batch.inverse).toEqual({
                type: 'group',
                label: 'delete tables',
                commands: reference.inverses,
            });
        });

        it(`${name}: undo restores the design exactly, redo removes again`, () => {
            const done = applyOk(base, planDeleteEntities(ids));
            const undone = applyOk(done.design, done.inverse);
            expect(sameButDate(undone.design, base)).toEqual(base);
            const redone = applyOk(undone.design, undone.inverse);
            expect(sameButDate(redone.design, done.design)).toEqual(
                done.design
            );
        });
    }

    it('leaves the part maps and lists free of the removed tables', () => {
        const done = applyOk(base, planDeleteEntities(all)).design;
        expect(done.entities.order).toEqual([]);
        expect(Object.keys(done.columns)).toEqual([]);
        expect(Object.keys(done.keys)).toEqual([]);
        expect(Object.keys(done.rules)).toEqual([]);
        expect(done.links.order).toEqual([]);
        expect(Object.keys(done.links.byId)).toEqual([]);
        expect(done.dependencies).toEqual([]);
    });

    it('refuses an unknown or repeated id and changes nothing', () => {
        for (const ids of [
            [all[0], 'nope'],
            [all[0], all[0]],
        ]) {
            const result = apply(base, planDeleteEntities(ids));
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toBe('not-found');
        }
    });

    it('does not touch the original design', () => {
        const copy = structuredClone(base);
        applyOk(base, planDeleteEntities(all));
        expect(base).toEqual(copy);
    });

    describe('inserting many tables in one pass', () => {
        // the undo of a delete is a run of inserts, with their links
        const inserts = (ids: string[]) => {
            const done = applyOk(base, planDeleteEntities(ids));
            const undo = done.inverse;
            if (undo.type !== 'group') throw new Error('no group');
            return { gone: done.design, commands: undo.commands };
        };

        for (const [name, ids] of orders) {
            it(`${name}: same design and same inverses as one by one`, () => {
                const { gone, commands } = inserts(ids);
                let current = gone;
                const inverses: Command[] = [];
                for (const command of commands) {
                    const step = applyOk(current, command);
                    current = step.design;
                    inverses.unshift(step.inverse);
                }
                const batch = applyOk(gone, { type: 'group', commands });
                expect(sameButDate(batch.design, current)).toEqual(current);
                expect(sameButDate(batch.design, base)).toEqual(base);
                expect(batch.inverse).toEqual({
                    type: 'group',
                    commands: inverses,
                });
            });
        }

        it('refuses a table that is already there and changes nothing', () => {
            const { commands } = inserts(all.slice(0, 2));
            const result = apply(base, { type: 'group', commands });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toBe('duplicate');
        });

        it('refuses a link whose other table is missing', () => {
            const { gone, commands } = inserts(all);
            const holder = commands.find(
                (c) => c.type === 'entity.insert' && c.links?.length
            );
            if (holder?.type !== 'entity.insert') throw new Error('no link');
            const link = holder.links![0].item;
            const other = [link.sourceEntityId, link.targetEntityId].find(
                (id) => id !== holder.parts.entity.id
            );
            const rest = commands.filter(
                (c) =>
                    !(c.type === 'entity.insert' && c.parts.entity.id === other)
            );
            expect(rest.length).toBe(commands.length - 1);
            const result = apply(gone, { type: 'group', commands: rest });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toBe('invalid');
        });
    });
});
