import { describe, expect, it } from 'vitest';
import { applyOk, rng, withTables } from '@/core/testing/helpers';
import { planLink } from '@/core/commands/plan-link';
import { planAddEntity } from '@/core/commands/plan-entity';
import {
    cardinalityChoiceOf,
    linkableTables,
    listRefs,
    refusalOf,
} from '../link-rules';

function linked() {
    let design = withTables(['users', 'orders', 'items']);
    const [users, orders] = design.entities.order.map(
        (id) => design.entities.byId[id]
    );
    const plan = planLink(
        design,
        { entityId: users.id, columnId: users.columnIds[0] },
        { entityId: orders.id, columnId: orders.columnIds[0] },
        { random: rng(3) }
    );
    if (plan.kind !== 'ok') throw new Error('expected a link');
    design = applyOk(design, plan.command).design;
    return { design, link: plan.link, users, orders };
}

describe('EDT-180 the Refs list', () => {
    it('matches the link name and both table names', () => {
        const { design, link } = linked();
        const find = (text: string) =>
            listRefs({ design, filter: {}, showViews: true, text }).map(
                (l) => l.id
            );
        expect(find('')).toEqual([link.id]);
        expect(find('USERS_ID')).toEqual([link.id]);
        expect(find('orders')).toEqual([link.id]);
        expect(find('items')).toEqual([]);
    });

    it('shows a link only when both tables are visible', () => {
        const { design, users } = linked();
        expect(
            listRefs({
                design,
                filter: { tableIds: [users.id] },
                showViews: true,
            })
        ).toEqual([]);
    });
});

describe('EDT-170 EDT-179 cardinality choices', () => {
    it('reads one-to-one, one-to-many and many-to-one', () => {
        expect(
            cardinalityChoiceOf({
                sourceCardinality: 'one',
                targetCardinality: 'one',
            })
        ).toBe('one-to-one');
        expect(
            cardinalityChoiceOf({
                sourceCardinality: 'one',
                targetCardinality: 'many',
            })
        ).toBe('one-to-many');
        expect(
            cardinalityChoiceOf({
                sourceCardinality: 'many',
                targetCardinality: 'one',
            })
        ).toBe('many-to-one');
    });
});

describe('EDT-154 EDT-155 EDT-157 EDT-166 why a link is refused', () => {
    it('names the reason for each refused plan', () => {
        const { design, users, orders } = linked();
        const a = { entityId: users.id, columnId: users.columnIds[0] };
        const b = { entityId: orders.id, columnId: orders.columnIds[0] };
        expect(refusalOf(planLink(design, a, b))).toBe('exists');
        expect(refusalOf(planLink(design, b, a))).toBe('exists');
        expect(refusalOf(planLink(design, a, { ...b, columnId: 'x' }))).toBe(
            'missing'
        );
    });

    it('does not offer views for a link', () => {
        const { design } = linked();
        const withView = applyOk(
            design,
            planAddEntity(design, { kind: 'view', name: 'v' })
        ).design;
        expect(linkableTables(withView).map((e) => e.name)).toEqual([
            'users',
            'orders',
            'items',
        ]);
    });
});
