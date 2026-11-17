import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { planAddColumn, planUpdateColumn } from '@/core/commands/plan-column';
import type { Design } from '@/core/model/design';
import { applyOk, withTables } from '@/core/testing/helpers';
import { renderPanel } from '@/features/testing/render-panel';
import { FieldsEditor } from '../fields-editor';

// A column with a description is marked by a small comment icon. It sits INSIDE the
// right end of the name box (design/field-description), so the box is the same width
// on every row, with or without a description. Widths need layout, which a test has
// not got, so these check what makes them equal: the same box, built the same way,
// with nothing extra between it and the type button.

const DESCRIPTION = 'Customer billing contact';

/** one table with two fields: the first without a description, the second with one */
function design(): Design {
    const base = withTables(['orders']);
    const table = base.entities.byId[base.entities.order[0]];
    const added = applyOk(base, planAddColumn(base, table.id)!).design;
    const entity = added.entities.byId[added.entities.order[0]];
    return applyOk(
        added,
        planUpdateColumn(entity.id, entity.columnIds[1], {
            comments: DESCRIPTION,
        })
    ).design;
}

const show = (compact: boolean) => {
    const d = design();
    const entity = d.entities.byId[d.entities.order[0]];
    return renderPanel(<FieldsEditor entity={entity} compact={compact} />, d);
};

const nameBoxes = () => screen.getAllByLabelText('Field name');
const icon = () =>
    screen.queryByRole('button', { name: 'Show field description' });

describe.each([
    ['in the side panel', false],
    ['in the card on the canvas', true],
])('the description marker %s', (_where, compact) => {
    it('is built the same on every row, with or without a description', () => {
        show(compact);
        const [plain, described] = nameBoxes();
        const wrapper = (el: HTMLElement) => el.parentElement as HTMLElement;
        // the same box around the name field...
        expect(wrapper(plain).className).toBe(wrapper(described).className);
        expect(wrapper(plain).className).toContain('flex-1');
        // ...followed straight by the type button: nothing is added beside the box
        for (const box of [plain, described]) {
            const next = wrapper(box).nextElementSibling;
            expect(next?.getAttribute('role')).toBe('combobox');
        }
    });

    it('puts the icon inside the name box of the row that has a description only', () => {
        show(compact);
        const [plain, described] = nameBoxes();
        expect(
            within(plain.parentElement as HTMLElement).queryByRole('img')
        ).toBeNull();
        expect(
            within(plain.parentElement as HTMLElement).queryByRole('button', {
                name: 'Show field description',
            })
        ).toBeNull();
        const inside = within(described.parentElement as HTMLElement);
        const marker = compact
            ? inside.getByRole('img')
            : inside.getByRole('button', { name: 'Show field description' });
        expect(marker).toBeTruthy();
        // laid over the right end of the box, not placed after it
        expect(marker.className).toContain('absolute');
        expect(marker.className).toContain('right-');
    });

    it('makes room for the icon in the text of that row only', () => {
        show(compact);
        const [plain, described] = nameBoxes();
        const room = compact ? 'pr-9' : 'pr-8';
        expect(described.className).toContain(room);
        expect(plain.className).not.toContain(room);
        // the box itself is the same size on both
        const sizes = (el: HTMLElement) =>
            el.className
                .split(' ')
                .filter((c) => /^(h-|w-|min-w-|flex-)/.test(c))
                .sort();
        expect(sizes(plain)).toEqual(sizes(described));
    });

    it('shows the description as a tooltip', () => {
        show(compact);
        const marker = compact
            ? screen.getByRole('img', { name: DESCRIPTION })
            : icon();
        expect(marker?.getAttribute('title')).toBe(DESCRIPTION);
    });
});

describe('the description marker in the side panel', () => {
    it('is one button, on the row that has a description', () => {
        show(false);
        expect(
            screen.getAllByRole('button', { name: 'Show field description' })
        ).toHaveLength(1);
    });

    it('opens Field Attributes of that column when clicked', async () => {
        show(false);
        await userEvent.click(icon()!);
        const pop = await screen.findByRole('dialog');
        expect(pop.getAttribute('aria-label')).toBe('Field Attributes');
        // and it is the description of this column that is in it
        expect(
            (
                within(pop).getByPlaceholderText(
                    'No description'
                ) as HTMLTextAreaElement
            ).value
        ).toBe(DESCRIPTION);
    });

    it('does not keep the name box from being typed in', async () => {
        show(false);
        const [, described] = nameBoxes();
        await userEvent.click(described);
        expect(document.activeElement).toBe(described);
    });
});

describe('the description marker in the card on the canvas', () => {
    it('is not a button: the card has no Field Attributes to open', () => {
        show(true);
        expect(icon()).toBeNull();
    });
});
