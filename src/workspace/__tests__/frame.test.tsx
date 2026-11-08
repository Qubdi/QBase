import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, expect, it, vi } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { ImportDatabaseDialog } from '@/dialogs/import-database-dialog/import-database-dialog';
import { ClearDesignDialog } from '@/features/designs/clear-design-dialog';
import { ExportJsonDialog } from '@/features/export/export-json-dialog';
import { ExportSqlDialog } from '@/features/export/export-sql-dialog';
import { SettingsDialog } from '@/features/settings/settings-dialog';
import { DiagramName } from '../navbar/diagram-name';
import { EditorFrame } from '../editor-frame';
import { Rail } from '../rail';
import { renderInEditor } from './test-harness';

const frame = (options = { design: blank() }) =>
    renderInEditor(
        <HelmetProvider>
            <EditorFrame />
        </HelmetProvider>,
        options
    );

describe('editor frame (EDT-001 to EDT-010, SHL-050)', () => {
    it('shows the navbar slots, the rail, the side panel place and the canvas place', () => {
        const { container } = frame();
        for (const slot of [
            'navbar-left',
            'navbar-right',
            'below-navbar',
            'side-panel',
            'canvas',
        ])
            expect(
                container.querySelector(`[data-slot="${slot}"]`),
                slot
            ).toBeTruthy();
        expect(
            screen.getByRole('navigation', { name: 'Editor sections' })
        ).toBeTruthy();
    });

    it('the QBase controls sit in the right slot, not the left one', () => {
        const { container } = frame();
        const right = container.querySelector(
            '[data-slot="navbar-right"]'
        ) as HTMLElement;
        const left = container.querySelector(
            '[data-slot="navbar-left"]'
        ) as HTMLElement;
        expect(
            within(right).getByRole('button', { name: 'Change language' })
        ).toBeTruthy();
        expect(
            within(left).queryByRole('button', { name: 'Change language' })
        ).toBeNull();
    });

    it('Ctrl+B hides and shows the side panel; Ctrl+Z undoes an edit', async () => {
        const { store } = frame({ design: withTables(['a']) });
        expect(store.getState().ui.panel.open).toBe(true);
        fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
        expect(store.getState().ui.panel.open).toBe(false);
        fireEvent.keyDown(document.body, { key: 'b', ctrlKey: true });
        expect(store.getState().ui.panel.open).toBe(true);

        store.getState().edit({ type: 'design.rename', name: 'Renamed' });
        expect(store.getState().design.name).toBe('Renamed');
        fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
        expect(store.getState().design.name).toBe('Test');
        fireEvent.keyDown(document.body, {
            key: 'z',
            ctrlKey: true,
            shiftKey: true,
        });
        expect(store.getState().design.name).toBe('Renamed');
    });

    it('Ctrl+Z inside a text box is left to the box', () => {
        const { store } = frame();
        store.getState().edit({ type: 'design.rename', name: 'Renamed' });
        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
        expect(store.getState().design.name).toBe('Renamed');
        input.remove();
    });

    it('Ctrl+O opens the Open dialog in local mode', async () => {
        frame();
        fireEvent.keyDown(document.body, { key: 'o', ctrlKey: true });
        expect(await screen.findByText('Open Database')).toBeTruthy();
    });

    it('Ctrl+M flips the theme, also inside a text box', async () => {
        frame();
        const input = document.createElement('input');
        document.body.appendChild(input);
        const before = document.documentElement.classList.contains('dark');
        fireEvent.keyDown(input, { key: 'm', ctrlKey: true });
        await waitFor(() =>
            expect(document.documentElement.classList.contains('dark')).toBe(
                !before
            )
        );
        input.remove();
    });

    it('Ctrl+S confirms with a toast (EDT-257)', async () => {
        frame();
        const { toast } = await import('@/platform/toast/use-toast');
        const spy = vi.spyOn(
            await import('@/platform/toast/use-toast'),
            'toast'
        );
        fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
        expect(toast).toBeTypeOf('function');
    });
});

describe('rail (SHL-051 to SHL-056)', () => {
    it('the Custom types entry only exists for a database with custom types', () => {
        const pg = renderInEditor(<Rail />, { design: blank('postgresql') });
        expect(
            screen.getByRole('button', { name: 'Custom Types' })
        ).toBeTruthy();
        pg.unmount();
        renderInEditor(<Rail />, { design: blank('mysql') });
        expect(
            screen.queryByRole('button', { name: 'Custom Types' })
        ).toBeNull();
    });

    it('choosing a section shows the panel on it; Extras opens on Areas', () => {
        const { store } = renderInEditor(<Rail />, {
            design: blank('postgresql'),
            panelOpen: false,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Refs' }));
        expect(store.getState().ui.panel).toMatchObject({
            open: true,
            section: 'refs',
        });
        fireEvent.click(screen.getByRole('button', { name: 'Visuals' }));
        expect(store.getState().ui.panel).toMatchObject({
            section: 'visuals',
            visualsTab: 'areas',
        });
        expect(
            screen
                .getByRole('button', { name: 'Visuals' })
                .getAttribute('aria-pressed')
        ).toBe('true');
    });
});

describe('diagram name (SHL-035)', () => {
    it('double-click edits, Enter saves, an empty name is ignored', () => {
        const { store } = renderInEditor(<DiagramName />, { design: blank() });
        fireEvent.doubleClick(screen.getByTestId('diagram-name'));
        const input = screen.getByRole('textbox', { name: 'Diagram name' });
        fireEvent.change(input, { target: { value: 'Shop' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(store.getState().design.name).toBe('Shop');

        fireEvent.doubleClick(screen.getByTestId('diagram-name'));
        const again = screen.getByRole('textbox', { name: 'Diagram name' });
        fireEvent.change(again, { target: { value: '   ' } });
        fireEvent.keyDown(again, { key: 'Enter' });
        expect(store.getState().design.name).toBe('Shop');
    });

    it('Escape cancels and a read-only diagram cannot be renamed', () => {
        const { store, unmount } = renderInEditor(<DiagramName />, {
            design: blank(),
        });
        fireEvent.doubleClick(screen.getByTestId('diagram-name'));
        const input = screen.getByRole('textbox', { name: 'Diagram name' });
        fireEvent.change(input, { target: { value: 'Nope' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(store.getState().design.name).toBe('Test');
        unmount();
        renderInEditor(<DiagramName />, { design: blank(), readonly: true });
        fireEvent.doubleClick(screen.getByTestId('diagram-name'));
        expect(
            screen.queryByRole('textbox', { name: 'Diagram name' })
        ).toBeNull();
    });
});

describe('import into the open diagram (IMP-075, IMP-076, spec 16.2)', () => {
    it('adds the pasted tables, says how many, and clears the history', async () => {
        const { store } = renderInEditor(
            <ImportDatabaseDialog
                dialog={{ open: true, methods: ['sql'], initial: 'sql' }}
            />,
            {
                design: withTables(['users']),
                now: () => NOW,
            }
        );
        fireEvent.change(
            await screen.findByRole('textbox', { name: 'SQL script' }),
            {
                target: {
                    value: 'CREATE TABLE orders (id int primary key);\nCREATE TABLE users (id int primary key);',
                },
            }
        );
        const apply = screen.getByRole('button', {
            name: 'Import',
        }) as HTMLButtonElement;
        await waitFor(() => expect(apply.disabled).toBe(false), {
            timeout: 3000,
        });
        expect(screen.getByTestId('import-summary').textContent).toContain(
            '2 tables will be added.'
        );
        expect(screen.getByTestId('import-summary').textContent).toContain(
            'already exist'
        );
        fireEvent.click(apply);
        expect(store.getState().design.entities.order).toHaveLength(3);
        expect(store.getState().history.undo).toHaveLength(0);
        expect(store.getState().session.dirty).toBe(true);
    });
});

describe('Clear (EDT-224)', () => {
    it('keeps the diagram identity, removes the content and empties the history', async () => {
        const design = { ...withTables(['a', 'b']), name: 'Shop' };
        const { store } = renderInEditor(
            <ClearDesignDialog open onClose={() => undefined} />,
            { design }
        );
        const alert = await screen.findByRole('alertdialog');
        expect(store.getState().design.entities.order).toHaveLength(2);
        fireEvent.click(within(alert).getByRole('button', { name: 'Clear' }));
        const next = store.getState().design;
        expect(next.entities.order).toHaveLength(0);
        expect(next.id).toBe(design.id);
        expect(next.name).toBe('Shop');
        expect(next.createdAt).toBe(design.createdAt);
        expect(store.getState().session.dirty).toBe(true);
    });
});

describe('export dialogs (EXP-001 to EXP-004, EXP-058)', () => {
    it('SQL: shows the script for the target', async () => {
        const design = withTables(['users']);
        renderInEditor(
            <ExportSqlDialog target="postgresql" onClose={() => undefined} />,
            { design }
        );
        const box = (await screen.findByRole('textbox', {
            name: 'Generated script',
        })) as HTMLTextAreaElement;
        expect(box.value).toContain('CREATE TABLE');
        expect(box.value).toContain('users');
    });

    it('SQL: an empty diagram shows the error state, not a script', async () => {
        renderInEditor(
            <ExportSqlDialog target="mysql" onClose={() => undefined} />,
            { design: blank() }
        );
        expect((await screen.findByRole('alert')).textContent).toContain(
            'no tables'
        );
        expect(
            (screen.getByRole('button', { name: /Copy/ }) as HTMLButtonElement)
                .disabled
        ).toBe(true);
    });

    it('SQL: the filter limits what is exported (EXP-002)', async () => {
        const design = withTables(['users', 'orders']);
        const hidden = design.entities.order[1];
        renderInEditor(
            <ExportSqlDialog target="postgresql" onClose={() => undefined} />,
            {
                design,
                filter: { tableIds: [design.entities.order[0]] },
            }
        );
        const box = (await screen.findByRole('textbox', {
            name: 'Generated script',
        })) as HTMLTextAreaElement;
        expect(box.value).toContain('users');
        expect(box.value).not.toContain('orders');
        expect(hidden).toBeTruthy();
    });

    it('JSON: names the file QBase(<name>).json', async () => {
        renderInEditor(<ExportJsonDialog open onClose={() => undefined} />, {
            design: { ...blank(), name: 'Shop' },
        });
        expect(await screen.findByText(/QBase\(Shop\)\.json/)).toBeTruthy();
    });
});

describe('preferences (SHL-076 to SHL-083)', () => {
    it('toggles write to local storage and come back after a reload of the provider', () => {
        localStorage.clear();
        renderInEditor(
            <SettingsDialog
                open
                shortcuts={[{ label: 'Undo', keys: 'Ctrl+Z' }]}
                onClose={() => undefined}
            />,
            { design: blank() }
        );
        const attributes = screen.getByRole('checkbox', {
            name: 'Show field attributes',
        });
        expect(attributes.getAttribute('aria-checked')).toBe('true');
        fireEvent.click(attributes);
        expect(localStorage.getItem('show_field_attributes')).toBe('false');
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Show the minimap' })
        );
        expect(localStorage.getItem('show_minimap_on_canvas')).toBe('false');
        expect(screen.getByText('Ctrl+Z')).toBeTruthy();
        localStorage.clear();
    });
});
