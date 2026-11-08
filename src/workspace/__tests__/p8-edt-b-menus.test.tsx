import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceContext } from '@/components/qubdi/workspace-context';
import type { Workspace } from '@/components/qubdi/workspace-context';
import { applyOk, blank, NOW, withTables } from '@/core/testing/helpers';
import { ImportDatabaseDialog } from '@/dialogs/import-database-dialog/import-database-dialog';
import { ClearDesignDialog } from '@/features/designs/clear-design-dialog';
import { DeleteOpenDesignDialog } from '@/features/designs/delete-open-design-dialog';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { Toaster } from '@/platform/toast/toaster';
import { Menus } from '../navbar/menus';
import { renderInEditor } from './test-harness';

afterEach(() => localStorage.clear());

const openMenu = async (name: string) => {
    fireEvent.keyDown(screen.getByRole('menuitem', { name }), { key: 'Enter' });
    await screen.findByRole('menu');
};

const asRole = (role: 'owner' | 'editor' | 'viewer'): Workspace => ({
    project: {
        id: 'p',
        name: 'P',
        slug: 'p',
        description: '',
        diagramCount: 1,
        role,
    },
    localDiagramId: 'design-1',
    remoteDiagramId: undefined,
});

const inProject = (role: 'owner' | 'editor' | 'viewer') =>
    function wrapInProject(node: React.ReactElement) {
        return (
            <WorkspaceContext.Provider value={asRole(role)}>
                {node}
            </WorkspaceContext.Provider>
        );
    };

describe('EDT-226 Clear asks first and empties the history', () => {
    it('Cancel changes nothing; confirming empties the diagram and the history', async () => {
        let closed = 0;
        const base = withTables(['a', 'b']);
        const design = applyOk(base, {
            type: 'entity.update',
            id: base.entities.order[0],
            patch: { x: 40 },
        }).design;
        const { store } = renderInEditor(
            <ClearDesignDialog open onClose={() => (closed += 1)} />,
            { design, now: () => NOW }
        );
        store.getState().edit({
            type: 'entity.update',
            id: design.entities.order[0],
            patch: { x: 80 },
        });
        expect(store.getState().history.undo.length).toBeGreaterThan(0);
        const alert = await screen.findByRole('alertdialog');
        fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' }));
        expect(closed).toBe(1);
        expect(store.getState().design.entities.order).toHaveLength(2);
        expect(store.getState().history.undo.length).toBeGreaterThan(0);

        fireEvent.click(within(alert).getByRole('button', { name: 'Clear' }));
        expect(store.getState().design.entities.order).toHaveLength(0);
        expect(store.getState().history.undo).toHaveLength(0);
        expect(store.getState().history.redo).toHaveLength(0);
    });
});

describe('EDT-251 the menu bar', () => {
    it('has the diagram (Actions), Edit, View and Backup menus (SHL-064)', () => {
        renderInEditor(<Menus commands={{}} />, { design: blank() });
        const names = screen.getAllByRole('menuitem').map((m) => m.textContent);
        expect(names).toEqual(['Actions', 'Edit', 'View', 'Backup']);
    });
});

describe('EDT-252 View > side panel', () => {
    it('toggles the panel and shows the Mod+B key', async () => {
        let toggled = 0;
        renderInEditor(
            <Menus commands={{ togglePanel: () => (toggled += 1) }} />,
            { design: blank() }
        );
        await openMenu('View');
        const item = screen.getByRole('menuitem', {
            name: /Hide Sidebar/,
        });
        expect(item.textContent).toMatch(/Ctrl\+B/);
        fireEvent.click(item);
        await waitFor(() => expect(toggled).toBe(1));
    });
});

describe('EDT-253 View > Theme', () => {
    it('offers System, Light and Dark and applies the choice', async () => {
        renderInEditor(<Menus commands={{}} />, { design: blank() });
        await openMenu('View');
        fireEvent.keyDown(
            await screen.findByRole('menuitem', { name: /Theme/ }),
            {
                key: 'ArrowRight',
            }
        );
        const radios = await screen.findAllByRole('menuitemradio');
        expect(radios.map((r) => r.textContent)).toEqual([
            'System',
            'Light',
            'Dark',
        ]);
        fireEvent.click(radios[2]);
        await waitFor(() => expect(localStorage.getItem('theme')).toBe('dark'));
    });
});

describe('EDT-254 display preferences live in the browser, not in the diagram', () => {
    it('toggling one writes local storage and leaves the diagram alone', async () => {
        const design = withTables(['a']);
        const { store } = renderInEditor(<Menus commands={{}} />, { design });
        await openMenu('View');
        const item = screen.getByRole('menuitem', {
            name: /Hide Cardinality/,
        });
        fireEvent.click(item);
        await waitFor(() =>
            expect(localStorage.getItem('show_cardinality')).toBe('false')
        );
        expect(store.getState().design).toBe(design);
        expect(store.getState().session.dirty).toBe(false);
        expect(store.getState().history.undo).toHaveLength(0);
    });
});

describe('EDT-258 Delete diagram', () => {
    it('is offered locally and to project owners, hidden for everyone else', async () => {
        for (const [wrap, shown] of [
            [undefined, true],
            [inProject('owner'), true],
            [inProject('editor'), false],
            [inProject('viewer'), false],
        ] as const) {
            const view = renderInEditor(
                <Menus commands={{}} />,
                { design: blank() },
                '/diagrams/x',
                undefined,
                wrap
            );
            await openMenu('Actions');
            expect(
                !!screen.queryByRole('menuitem', {
                    name: 'Delete',
                })
            ).toBe(shown);
            view.unmount();
        }
    });

    it('asks first, with Delete and Cancel; Cancel keeps the diagram', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        let closed = 0;
        renderInEditor(
            <DeleteOpenDesignDialog open onClose={() => (closed += 1)} />,
            { design },
            '/diagrams/x',
            adapter
        );
        const alert = await screen.findByRole('alertdialog');
        expect(
            within(alert).getByRole('button', { name: 'Delete' })
        ).toBeTruthy();
        fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' }));
        expect(closed).toBe(1);
        expect(await adapter.list()).toHaveLength(1);
    });
});

describe('EDT-273 a failed diagram delete', () => {
    it('shows a toast and leaves the diagram editable and stored', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        adapter.remove = () => Promise.reject(new Error('blocked'));
        const { store } = renderInEditor(
            <>
                <DeleteOpenDesignDialog open onClose={() => undefined} />
                <Toaster />
            </>,
            { design },
            '/diagrams/x',
            adapter
        );
        const alert = await screen.findByRole('alertdialog');
        fireEvent.click(within(alert).getByRole('button', { name: 'Delete' }));
        expect(
            await screen.findByText('The diagram could not be deleted')
        ).toBeTruthy();
        expect(store.getState().session.readonly).toBeFalsy();
        expect(store.getState().design.entities.order).toHaveLength(1);
        expect(await adapter.list()).toHaveLength(1);
    });
});

describe('EDT-248 the import summary', () => {
    it('lists new tables, new relationships and the tables that already exist', async () => {
        renderInEditor(
            <ImportDatabaseDialog
                dialog={{ open: true, methods: ['sql'], initial: 'sql' }}
            />,
            { design: withTables(['users']), now: () => NOW }
        );
        fireEvent.change(
            await screen.findByRole('textbox', { name: 'SQL script' }),
            {
                target: {
                    value: [
                        'CREATE TABLE users (id int primary key);',
                        'CREATE TABLE orders (id int primary key, user_id int references users(id));',
                    ].join('\n'),
                },
            }
        );
        await waitFor(
            () =>
                expect(
                    screen.getByTestId('import-summary').textContent
                ).toMatch(/2 tables will be added/),
            { timeout: 3000 }
        );
        const text = screen.getByTestId('import-summary').textContent ?? '';
        expect(text).toMatch(/1 relationship/);
        expect(text).toContain('already exist');
    });
});
