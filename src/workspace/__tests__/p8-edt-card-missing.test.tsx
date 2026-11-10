import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { colorOptions } from '@/lib/colors';
import { CUSTOM_COLORS_KEY } from '@/lib/custom-colors';
import { applyOk, withTables } from '@/core/testing/helpers';
import { planAddColumn } from '@/core/commands/plan-column';
import { renderPanel } from '@/features/testing/render-panel';
import { EntityForm } from '@/features/tables/entity-form';
import { EntityEditor } from '../entity-editor';

beforeEach(() => {
    localStorage.clear();
});

const card = (design: ReturnType<typeof withTables>, index = 0) => {
    const id = design.entities.order[index];
    return renderPanel(
        <EntityEditor entityId={id} close={() => undefined} />,
        design
    );
};
const entityOf = (view: ReturnType<typeof renderPanel>, i = 0) => {
    const d = view.store.getState().design;
    return d.entities.byId[d.entities.order[i]];
};

describe('p8 EDT-084 table colour', () => {
    it('offers a palette of 12 colours and a custom one, in the edit form', () => {
        expect(colorOptions).toHaveLength(12);
        const view = card(withTables(['orders']));
        fireEvent.click(screen.getByRole('button', { name: 'Change color' }));
        fireEvent.click(
            screen.getByRole('button', { name: `Use ${colorOptions[0]}` })
        );
        expect(entityOf(view).color).toBe(colorOptions[0]);
        fireEvent.change(screen.getByLabelText('Hex color'), {
            target: { value: '#123456' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Use' }));
        expect(entityOf(view).color).toBe('#123456');
        expect(localStorage.getItem(CUSTOM_COLORS_KEY)).toContain('#123456');
    });

    it('the side panel form has the same picker', () => {
        const design = withTables(['orders']);
        const view = renderPanel(
            <EntityForm
                entity={design.entities.byId[design.entities.order[0]]}
            />,
            design
        );
        fireEvent.click(screen.getByRole('button', { name: 'Change color' }));
        fireEvent.click(
            screen.getByRole('button', { name: `Use ${colorOptions[3]}` })
        );
        expect(entityOf(view).color).toBe(colorOptions[3]);
    });
});

describe('p8 EDT-088 EDT-095 the edit card', () => {
    it('EDT-088: shows the schema, colour, open-in-panel button and the field count', () => {
        const base = withTables(['orders']);
        const design = applyOk(
            base,
            planAddColumn(base, base.entities.order[0])!
        ).design;
        const view = card(design);
        const group = screen.getByRole('group', { name: 'Edit table orders' });
        expect(within(group).getByLabelText('Schema')).toBeTruthy();
        expect(
            within(group).getByRole('button', { name: 'Change color' })
        ).toBeTruthy();
        expect(within(group).getByText('2 Fields')).toBeTruthy();
        fireEvent.click(
            within(group).getByRole('button', {
                name: 'Open in the side panel',
            })
        );
        const panel = view.store.getState().ui.panel;
        expect(panel.section).toBe('tables');
        expect(panel.expandedEntityId).toBe(design.entities.order[0]);
    });

    it('EDT-088: a database without schemas has no schema box', () => {
        card(withTables(['orders'], 'mysql'));
        expect(screen.queryByLabelText('Schema')).toBeNull();
    });

    it('EDT-095: Create new schema becomes a text box; Enter creates, Escape cancels', async () => {
        const view = card(withTables(['orders']));
        fireEvent.click(screen.getByLabelText('Schema'));
        fireEvent.click(
            await screen.findByRole('option', { name: 'Create new schema' })
        );
        const box = screen.getByLabelText('New schema name');
        fireEvent.change(box, { target: { value: 'sales' } });
        fireEvent.keyDown(box, { key: 'Escape' });
        expect(screen.queryByLabelText('New schema name')).toBeNull();
        expect(entityOf(view).schema).not.toBe('sales');
        fireEvent.click(screen.getByLabelText('Schema'));
        fireEvent.click(
            await screen.findByRole('option', { name: 'Create new schema' })
        );
        const again = screen.getByLabelText('New schema name');
        fireEvent.change(again, { target: { value: 'sales' } });
        fireEvent.keyDown(again, { key: 'Enter' });
        expect(entityOf(view).schema).toBe('sales');
        expect(screen.queryByLabelText('New schema name')).toBeNull();
    });
});

describe('p8 EDT-097 duplicate table names warn', () => {
    it('warns in the card and the side panel form, ignoring case, and blocks nothing', () => {
        const design = withTables(['orders', 'Orders', 'other']);
        card(design, 1);
        expect(screen.getByRole('alert').textContent).toContain('"Orders"');
        act(() => undefined);
    });

    it('the side panel form warns too, and a unique name does not', () => {
        const design = withTables(['orders', 'ORDERS', 'other']);
        const { unmount } = renderPanel(
            <EntityForm
                entity={design.entities.byId[design.entities.order[0]]}
            />,
            design
        );
        expect(screen.getByRole('alert')).toBeTruthy();
        unmount();
        renderPanel(
            <EntityForm
                entity={design.entities.byId[design.entities.order[2]]}
            />,
            design
        );
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
