import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { UserTypesSection } from '../user-types-section';

describe('EDT-195 the More actions menu of a custom type', () => {
    it('offers Delete and no Highlight Fields (dropped by EDT-196)', async () => {
        const design = applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'userTypes',
            item: { id: 'a', name: 'mood', kind: 'enum', values: [] },
        }).design;
        renderPanel(<UserTypesSection />, design);
        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        const items = await screen.findAllByRole('menuitem');
        expect(items.map((i) => i.textContent)).toEqual(['Delete']);
        expect(screen.queryByText(/highlight/i)).toBeNull();
    });
});
