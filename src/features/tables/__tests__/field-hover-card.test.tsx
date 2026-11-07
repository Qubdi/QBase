import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { applyOk, rng, withTables } from '@/core/testing/helpers';
import { planLink } from '@/core/commands/plan-link';
import { FieldHoverCard } from '../field-hover-card';

const anchor = {
    left: 10,
    right: 100,
    top: 50,
    height: 20,
} as DOMRect;

describe('EDT-116 the detail card of a field', () => {
    const base = withTables(['users', 'orders']);
    const [users, orders] = base.entities.order.map(
        (id) => base.entities.byId[id]
    );
    const plan = planLink(
        base,
        { entityId: users.id, columnId: users.columnIds[0] },
        { entityId: orders.id, columnId: orders.columnIds[0] },
        { random: rng(2) }
    );
    if (plan.kind !== 'ok') throw new Error('no link');
    const design = applyOk(base, plan.command).design;

    it('shows type, nullability, key flags and the referenced column', () => {
        const column = design.columns[orders.columnIds[0]];
        render(
            <FieldHoverCard
                anchor={anchor}
                design={design}
                entityId={orders.id}
                column={{ ...column, default: '0', comments: 'the key' }}
            />
        );
        expect(screen.getByText('bigint')).toBeTruthy();
        expect(screen.getByText('NOT NULL')).toBeTruthy();
        expect(screen.getByText('primary key')).toBeTruthy();
        expect(screen.getByText('references')).toBeTruthy();
        expect(screen.getByText('users.id')).toBeTruthy();
        expect(screen.getByText('the key')).toBeTruthy();
    });

    it('the referenced side says referenced by', () => {
        render(
            <FieldHoverCard
                anchor={anchor}
                design={design}
                entityId={users.id}
                column={design.columns[users.columnIds[0]]}
            />
        );
        expect(screen.getByText('referenced by')).toBeTruthy();
        expect(screen.getByText('orders.id')).toBeTruthy();
    });
});
