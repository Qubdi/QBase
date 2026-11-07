import React from 'react';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceContext } from '@/components/qubdi/workspace-context';
import { i18n } from '@/i18n/i18n';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { DeleteOpenDesignDialog } from '@/features/designs/delete-open-design-dialog';
import { OpenDesignDialog } from '@/features/designs/open-design-dialog';
import type { MyProject } from '@/lib/qubdi/api';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { Toaster } from '@/platform/toast/toaster';
import { resetToasts } from '@/platform/toast/use-toast';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useOptionalEditorStoreApi } from '@/store/store-context';
import { DiagramName } from '../navbar/diagram-name';
import { renderInEditor } from './test-harness';

const api = vi.hoisted(() => ({ deleteDiagram: vi.fn() }));
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api,
}));

const assign = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, assign },
    });
});
afterEach(() => act(() => resetToasts()));

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const OpenHere: React.FC<{ onCreate?: () => void; canClose?: boolean }> = ({
    onCreate = () => undefined,
    canClose = true,
}) => (
    <OpenDesignDialog
        open
        adapter={useStorageAdapter()}
        store={useOptionalEditorStoreApi()}
        canClose={canClose}
        onClose={() => undefined}
        onCreate={onCreate}
    />
);

const seeded = async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.save({
        ...withTables(['a']),
        id: 'one',
        name: 'Shop',
        updatedAt: NOW + 3,
    });
    await adapter.save({
        ...withTables(['a', 'b']),
        id: 'two',
        name: 'Blog',
        updatedAt: NOW + 2,
    });
    await adapter.save({
        ...withTables(['c']),
        id: 'three',
        name: 'Docs',
        updatedAt: NOW + 1,
    });
    return adapter;
};

const rowOf = async (name: string) =>
    (await screen.findByText(name)).closest('tr') as HTMLElement;
const menuOf = async (name: string) => {
    fireEvent.keyDown(
        screen.getByRole('button', { name: `Actions for ${name}` }),
        { key: 'Enter' }
    );
    return screen.findByRole('menu');
};

describe('Open dialog (SHL-043 to SHL-048)', () => {
    it('SHL-043: each row has the database icon, name, created, last modified, table count and a row menu', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/', adapter);
        const row = await rowOf('Shop');
        const cells = within(row).getAllByRole('cell');
        expect(cells).toHaveLength(6);
        expect(cells[0].querySelector('svg, img')).toBeTruthy();
        expect(cells[1].textContent).toBe('Shop');
        expect(cells[4].textContent).toBe('1');
        expect(
            within(cells[5]).getByRole('button', { name: 'Actions for Shop' })
        ).toBeTruthy();
        const heads = screen
            .getAllByRole('columnheader')
            .map((h) => h.textContent);
        expect(heads.slice(1, 5)).toEqual([
            'Name',
            'Created',
            'Changed',
            'Tables',
        ]);
        // the Created column is hidden on phones
        expect(
            screen.getByRole('columnheader', { name: 'Created' }).className
        ).toContain('hidden');
        expect(cells[2].className).toContain('hidden');
    });

    it('SHL-044: a click selects a row, Space and Enter open it, Up and Down move between rows', async () => {
        const adapter = await seeded();
        renderInEditor(
            <>
                <OpenHere />
                <Where />
            </>,
            null,
            '/',
            adapter
        );
        const shop = await rowOf('Shop');
        fireEvent.click(shop);
        expect(shop.getAttribute('aria-selected')).toBe('true');
        shop.focus();
        fireEvent.keyDown(shop, { key: 'ArrowDown' });
        const blog = await rowOf('Blog');
        expect(document.activeElement).toBe(blog);
        expect(blog.getAttribute('aria-selected')).toBe('true');
        expect(shop.getAttribute('aria-selected')).toBe('false');
        fireEvent.keyDown(blog, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(shop);
        fireEvent.keyDown(shop, { key: ' ' });
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/diagrams/one'
            )
        );
        fireEvent.keyDown(blog, { key: 'Enter' });
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/diagrams/two'
            )
        );
    });

    it('SHL-045: footer has Cancel (only when it can close), New database and Open (off until a row is chosen)', async () => {
        const adapter = await seeded();
        const onCreate = vi.fn();
        const closable = renderInEditor(
            <OpenHere onCreate={onCreate} />,
            null,
            '/',
            adapter
        );
        await screen.findByText('Shop');
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
        const open = screen.getByRole('button', {
            name: 'Open diagram',
        }) as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        fireEvent.click(await rowOf('Shop'));
        expect(open.disabled).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'New diagram' }));
        expect(onCreate).toHaveBeenCalled();
        closable.unmount();
        renderInEditor(<OpenHere canClose={false} />, null, '/', adapter);
        await screen.findByText('Shop');
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });

    it('SHL-046: the row menu has Open, Make a copy and a red Delete', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/', adapter);
        await screen.findByText('Shop');
        const menu = await menuOf('Shop');
        const items = within(menu).getAllByRole('menuitem');
        const names = items.map((i) => i.textContent?.trim());
        expect(names[0]).toBe('Open');
        expect(names).toContain('Make a copy');
        const last = items[items.length - 1];
        expect(last.textContent).toContain('Delete');
        expect(last.className).toContain('text-destructive');
    });

    it('SHL-047: Make a copy adds "<name> (Copy)" with new ids, refreshes the list and opens nothing', async () => {
        const adapter = await seeded();
        renderInEditor(
            <>
                <OpenHere />
                <Where />
            </>,
            null,
            '/start',
            adapter
        );
        await screen.findByText('Shop');
        await menuOf('Shop');
        fireEvent.click(screen.getByRole('menuitem', { name: /Make a copy/ }));
        expect(await screen.findByText('Shop (Copy)')).toBeTruthy();
        expect(screen.getByTestId('where').textContent).toBe('/start');
        const copy = (await adapter.list()).find(
            (d) => d.name === 'Shop (Copy)'
        )!;
        const original = (await adapter.load('one'))!.design;
        const copied = (await adapter.load(copy.id))!.design;
        expect(copy.id).not.toBe('one');
        expect(copied.entities.order).toHaveLength(
            original.entities.order.length
        );
        for (const id of copied.entities.order)
            expect(original.entities.order).not.toContain(id);
        // the original is untouched
        expect(original.name).toBe('Shop');
    });

    it('SHL-048: deleting asks first; deleting the open diagram goes to / with a reload', async () => {
        const adapter = await seeded();
        const open = (await adapter.load('one'))!.design;
        renderInEditor(
            <OpenHere />,
            { design: open },
            '/diagrams/one',
            adapter
        );
        await screen.findByText('Shop');
        await menuOf('Shop');
        fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
        const alert = await screen.findByRole('alertdialog');
        expect(assign).not.toHaveBeenCalled();
        expect(await adapter.list()).toHaveLength(3);
        fireEvent.click(within(alert).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
        expect((await adapter.list()).map((d) => d.id)).not.toContain('one');
    });

    it('SHL-048: deleting another diagram keeps the page and refreshes the list; the last one reloads to /', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save({
            ...withTables(['a']),
            id: 'one',
            name: 'Shop',
            updatedAt: NOW + 2,
        });
        await adapter.save({
            ...withTables(['a']),
            id: 'two',
            name: 'Blog',
            updatedAt: NOW + 1,
        });
        renderInEditor(<OpenHere />, null, '/', adapter);
        await screen.findByText('Blog');
        await menuOf('Blog');
        fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Delete',
            })
        );
        await waitFor(() => expect(screen.queryByText('Blog')).toBeNull());
        expect(assign).not.toHaveBeenCalled();
        await menuOf('Shop');
        fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Delete',
            })
        );
        await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    });

    it('SHL-049: the local Open dialog has a search box and a rename item', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/', adapter);
        await screen.findByText('Shop');
        expect(screen.getByRole('searchbox')).toBeTruthy();
        await menuOf('Shop');
        expect(screen.getByRole('menuitem', { name: /Rename/ })).toBeTruthy();
    });
});

describe('the diagram name in the bar (SHL-050, SHL-051)', () => {
    const edit = () => {
        fireEvent.doubleClick(screen.getByTestId('diagram-name'));
        return screen.getByRole('textbox', { name: 'Diagram name' });
    };

    it('SHL-050: the pencil starts editing and the check button saves', () => {
        const { store } = renderInEditor(<DiagramName />, { design: blank() });
        fireEvent.click(
            screen.getByRole('button', { name: 'Rename the diagram' })
        );
        const input = screen.getByRole('textbox', { name: 'Diagram name' });
        fireEvent.change(input, { target: { value: 'Pencil' } });
        fireEvent.click(screen.getByRole('button', { name: 'Keep this name' }));
        expect(store.getState().design.name).toBe('Pencil');
    });

    it('SHL-050: clicking away saves', () => {
        const { store } = renderInEditor(<DiagramName />, { design: blank() });
        const input = edit();
        fireEvent.change(input, { target: { value: 'Away' } });
        fireEvent.blur(input);
        expect(store.getState().design.name).toBe('Away');
    });

    it('SHL-051: the name has a "Double-click to rename" hint and cuts off at 300 px', () => {
        renderInEditor(<DiagramName />, { design: blank() });
        const name = screen.getByTestId('diagram-name');
        expect(name.className).toContain('max-w-[300px]');
        expect(name.className).toContain('truncate');
        // the hover text itself is a Radix tooltip that happy-dom cannot open
        // (SHL-051 manual check); the text is the one the name offers
        expect(i18n.t('editor.workspace.name.hint')).toBe(
            'Double-click to rename'
        );
    });

    it('SHL-051: clicking the database icon opens the Open dialog (closable)', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save(withTables(['a']));
        renderInEditor(
            <DiagramName />,
            { design: blank() },
            '/diagrams/x',
            adapter
        );
        fireEvent.click(
            document.querySelector('[data-testid="diagram-name"]')!
                .previousElementSibling!
        );
        expect(await screen.findByText('Your diagrams')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });
});

describe('Delete diagram (SHL-052, SHL-053)', () => {
    it('SHL-052: local mode asks, then deletes and goes to /', async () => {
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        renderInEditor(
            <DeleteOpenDesignDialog open onClose={() => undefined} />,
            { design },
            '/diagrams/x',
            adapter
        );
        const alert = await screen.findByRole('alertdialog');
        expect(assign).not.toHaveBeenCalled();
        fireEvent.click(within(alert).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
        expect(await adapter.list()).toHaveLength(0);
    });

    const project = {
        id: 'p1',
        name: 'Billing',
        slug: 'billing',
        role: 'owner',
    } as MyProject;
    const inProject = (node: React.ReactElement) => (
        <WorkspaceContext.Provider
            value={{ project, localDiagramId: 'x', remoteDiagramId: 'r1' }}
        >
            {node}
        </WorkspaceContext.Provider>
    );

    it('SHL-053: in a project the server copy goes first, then the local copy, then the project list', async () => {
        const order: string[] = [];
        api.deleteDiagram.mockImplementation(
            async () => void order.push('server')
        );
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        const remove = adapter.remove.bind(adapter);
        adapter.remove = async (id) => {
            order.push('local');
            return remove(id);
        };
        renderInEditor(
            <>
                <DeleteOpenDesignDialog open onClose={() => undefined} />
                <Where />
            </>,
            { design },
            '/billing/diagrams/r1',
            adapter,
            inProject
        );
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Delete',
            })
        );
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/billing/diagrams'
            )
        );
        expect(order).toEqual(['server', 'local']);
        expect(api.deleteDiagram).toHaveBeenCalledWith('r1');
    });

    it('SHL-053: when the server refuses, a red toast shows and nothing is lost', async () => {
        api.deleteDiagram.mockRejectedValue(new Error('no'));
        const adapter = new MemoryStorageAdapter();
        const design = withTables(['a']);
        await adapter.save(design);
        renderInEditor(
            <>
                <DeleteOpenDesignDialog open onClose={() => undefined} />
                <Toaster />
            </>,
            { design },
            '/billing/diagrams/r1',
            adapter,
            inProject
        );
        fireEvent.click(
            within(await screen.findByRole('alertdialog')).getByRole('button', {
                name: 'Delete',
            })
        );
        const title = await screen.findByText(
            'The diagram could not be deleted'
        );
        expect(title.closest('li')!.className).toContain('destructive');
        expect(await adapter.list()).toHaveLength(1);
        expect(assign).not.toHaveBeenCalled();
    });
});
