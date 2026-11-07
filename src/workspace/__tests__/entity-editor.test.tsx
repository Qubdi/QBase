import React from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { planAddColumn } from '@/core/commands/plan-column';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { EntityEditor } from '../entity-editor';

function twoFields() {
    const base = withTables(['orders']);
    const id = base.entities.order[0];
    return { id, design: applyOk(base, planAddColumn(base, id)!).design };
}

describe('EDT-137 the canvas edit card reorders fields', () => {
    it('shows a drag handle on every field row, as the side panel does', () => {
        const { id, design } = twoFields();
        renderPanel(
            <EntityEditor entityId={id} close={() => undefined} />,
            design
        );
        expect(
            screen.getAllByRole('button', { name: 'Drag to reorder' })
        ).toHaveLength(2);
    });

    it('offers no handle in a read-only diagram', () => {
        const { id, design } = twoFields();
        renderPanel(
            <EntityEditor entityId={id} close={() => undefined} />,
            design,
            { readonly: true }
        );
        expect(
            screen.queryByRole('button', { name: 'Drag to reorder' })
        ).toBeNull();
    });
});
