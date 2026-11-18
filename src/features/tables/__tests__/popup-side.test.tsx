import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { planUpdateColumn } from '@/core/commands/plan-column';
import { applyOk, withTables } from '@/core/testing/helpers';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { renderPanel } from '@/features/testing/render-panel';
import { UserTypesSection } from '@/features/user-types/user-types-section';
import { VisualsSection } from '@/features/regions-memos/visuals-section';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { FieldsEditor } from '../fields/fields-editor';
import { TablesSection } from '../tables-section';

// Everything that opens from the side panel opens like the column type list: its
// left edge on its trigger, growing to the right over the canvas, so the list it
// was opened from stays in view (design/popup-side). Radix says where it put a
// popup in `data-align`: "start" is the left edge on the trigger, "end" the right.
// Only what sits at the right edge of the window, with no room to the right, asks
// for "end".

const alignOf = (el: HTMLElement) => el.getAttribute('data-align');

const openFirstTable = async (
    design = withTables(['orders']),
    options?: Parameters<typeof renderPanel>[2]
) => {
    const view = renderPanel(<TablesSection />, design, options);
    await userEvent.click(
        screen.getByRole('button', { name: /^Show or hide the details/ })
    );
    return view;
};

describe('the primitives', () => {
    it('a popover opens with its left edge on its trigger unless it asks otherwise', async () => {
        render(
            <>
                <Popover>
                    <PopoverTrigger>by default</PopoverTrigger>
                    <PopoverContent aria-label="by default">x</PopoverContent>
                </Popover>
                <Popover>
                    <PopoverTrigger>at the window edge</PopoverTrigger>
                    <PopoverContent align="end" aria-label="at the window edge">
                        x
                    </PopoverContent>
                </Popover>
            </>
        );
        await userEvent.click(screen.getByText('by default'));
        expect(alignOf(await screen.findByLabelText('by default'))).toBe(
            'start'
        );
        await userEvent.keyboard('{Escape}');
        await userEvent.click(screen.getByText('at the window edge'));
        expect(
            alignOf(await screen.findByLabelText('at the window edge'))
        ).toBe('end');
    });

    it('a menu opens with its left edge on its button unless it asks otherwise', async () => {
        const menu = (align?: 'end') => (
            <DropdownMenu>
                <DropdownMenuTrigger>{align ?? 'default'}</DropdownMenuTrigger>
                <DropdownMenuContent align={align}>
                    <DropdownMenuItem>item</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
        const view = render(menu());
        await userEvent.click(screen.getByText('default'));
        expect(alignOf(await screen.findByRole('menu'))).toBe('start');
        view.unmount();
        render(menu('end'));
        await userEvent.click(screen.getByText('end'));
        expect(alignOf(await screen.findByRole('menu'))).toBe('end');
    });
});

describe('the popovers of a field', () => {
    it('opens the description to the right of its icon', async () => {
        const base = withTables(['orders']);
        const table = base.entities.byId[base.entities.order[0]];
        const design = applyOk(
            base,
            planUpdateColumn(table.id, table.columnIds[0], {
                comments: 'Customer billing contact',
            })
        ).design;
        renderPanel(
            <FieldsEditor
                entity={design.entities.byId[design.entities.order[0]]}
                compact={false}
            />,
            design
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Show field description' })
        );
        expect(alignOf(await screen.findByRole('dialog'))).toBe('start');
    });

    it('opens Field Attributes to the right of its "..." button', async () => {
        await openFirstTable();
        await userEvent.click(
            screen.getByRole('button', { name: 'Field Attributes' })
        );
        const pop = await screen.findByRole('dialog', {
            name: 'Field Attributes',
        });
        expect(alignOf(pop)).toBe('start');
    });

    it('opens Index Attributes to the right of its "..." button', async () => {
        await openFirstTable();
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add Index' }).at(-1)!
        );
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Index attributes' }).at(-1)!
        );
        const name = await screen.findByRole('textbox', { name: 'Name' });
        expect(alignOf(name.closest('[role="dialog"]') as HTMLElement)).toBe(
            'start'
        );
    });

    it('opens Check constraint to the right of its "..." button', async () => {
        await openFirstTable();
        await userEvent.click(
            screen.getByRole('button', { name: 'Check Constraints' })
        );
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add Check' }).at(-1)!
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Check constraint' })
        );
        const pop = (
            await screen.findByRole('button', {
                name: 'Delete check constraint',
            })
        ).closest('[role="dialog"]') as HTMLElement;
        expect(alignOf(pop)).toBe('start');
    });
});

describe('the menus of the side panel', () => {
    it('opens Table Actions to the right of its button', async () => {
        await openFirstTable();
        await userEvent.click(
            screen.getByRole('button', { name: 'Table Actions' })
        );
        expect(alignOf(await screen.findByRole('menu'))).toBe('start');
    });

    it('opens the Add Table menu to the right of its arrow', async () => {
        renderPanel(<TablesSection />, withTables(['a']), { showViews: true });
        await userEvent.click(
            screen.getByRole('button', { name: 'More ways to add' })
        );
        expect(alignOf(await screen.findByRole('menu'))).toBe('start');
    });

    it('opens the actions of a custom type to the right of its button', async () => {
        const design = applyOk(withTables([]), {
            type: 'item.insert',
            collection: 'userTypes',
            item: { id: 'a', name: 'mood', kind: 'enum', values: [] },
        }).design;
        renderPanel(<UserTypesSection />, design);
        await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
        expect(alignOf(await screen.findByRole('menu'))).toBe('start');
    });

    it('opens the actions of an area to the right of its button', async () => {
        renderPanel(<VisualsSection />, withTables([]));
        await userEvent.click(
            screen.getAllByRole('button', { name: 'Add Area' })[0]
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Area actions' })
        );
        expect(alignOf(await screen.findByRole('menu'))).toBe('start');
    });
});

describe('the colour picker', () => {
    it('opens with its left edge on its swatch, not centred on it', async () => {
        render(<ColorPicker color="#8eb7ff" onChange={() => {}} />);
        await userEvent.click(
            screen.getByRole('button', { name: 'Change color' })
        );
        const pop = (await screen.findByLabelText('Hex color')).closest(
            '[role="dialog"]'
        ) as HTMLElement;
        expect(alignOf(pop)).toBe('start');
    });
});
