import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { CreateDiagramDialog } from '@/dialogs/create-diagram-dialog/create-diagram-dialog';
import { OpenDesignDialog } from '@/features/designs/open-design-dialog';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useOptionalEditorStoreApi } from '@/store/store-context';
import { renderInEditor } from './test-harness';

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const OpenHere: React.FC<{
    canClose?: boolean;
    onClose?: () => void;
    onCreate?: () => void;
}> = ({
    canClose = true,
    onClose = () => undefined,
    onCreate = () => undefined,
}) => (
    <OpenDesignDialog
        open
        adapter={useStorageAdapter()}
        store={useOptionalEditorStoreApi()}
        canClose={canClose}
        onClose={onClose}
        onCreate={onCreate}
    />
);

const seeded = async () => {
    const adapter = new MemoryStorageAdapter();
    await adapter.save({
        ...withTables(['a']),
        id: 'one',
        name: 'Shop',
        updatedAt: NOW + 2,
    });
    await adapter.save({
        ...withTables(['a', 'b']),
        id: 'two',
        name: 'Blog',
        updatedAt: NOW + 1,
    });
    return adapter;
};

describe('Open dialog, local mode (SHL-043 to SHL-049)', () => {
    it('lists the diagrams newest first with their table counts', async () => {
        const adapter = await seeded();
        await adapter.save({
            ...withTables(['c']),
            id: 'three',
            name: 'Docs',
            updatedAt: NOW + 3,
        });
        renderInEditor(<OpenHere />, null, '/diagrams/x', adapter);
        await screen.findByText('Docs');
        const rows = screen.getAllByRole('row');
        const names = rows
            .slice(1)
            .map((r) => within(r).getAllByRole('cell')[1].textContent);
        expect(names).toEqual(['Docs', 'Shop', 'Blog']);
        expect(within(rows[3]).getAllByRole('cell')[4].textContent).toBe('2');
    });

    it('filters by the search text', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/diagrams/x', adapter);
        await screen.findByText('Shop');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'blo' },
        });
        expect(screen.queryByText('Shop')).toBeNull();
        expect(screen.getByText('Blog')).toBeTruthy();
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'zzz' },
        });
        expect(screen.getByText('No diagram has that name.')).toBeTruthy();
    });

    it('a row opens with a double click, remembers it as the default and goes to its address', async () => {
        const onClose = vi.fn();
        const adapter = await seeded();
        renderInEditor(
            <>
                <OpenHere onClose={onClose} />
                <Where />
            </>,
            null,
            '/',
            adapter
        );
        const row = (await screen.findByText('Blog')).closest(
            'tr'
        ) as HTMLElement;
        fireEvent.doubleClick(row);
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/diagrams/two'
            )
        );
        expect((await adapter.readSettings()).defaultDiagramId).toBe('two');
        expect(onClose).toHaveBeenCalled();
    });

    it('Open stays off until a row is chosen, and Enter on a row opens it', async () => {
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
        const row = (await screen.findByText('Shop')).closest(
            'tr'
        ) as HTMLElement;
        const open = screen.getByRole('button', {
            name: 'Open diagram',
        }) as HTMLButtonElement;
        expect(open.disabled).toBe(true);
        fireEvent.click(row);
        expect(open.disabled).toBe(false);
        fireEvent.keyDown(row, { key: 'Enter' });
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/diagrams/one'
            )
        );
    });

    it('a dialog that cannot be closed shows no Cancel button', async () => {
        renderInEditor(<OpenHere canClose={false} />, null);
        await screen.findByRole('dialog');
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        expect(
            screen.getByRole('button', { name: 'New diagram' })
        ).toBeTruthy();
    });

    it('duplicate makes "<name> (Copy)" without opening it', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/diagrams/x', adapter);
        await screen.findByText('Shop');
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Actions for Shop' }),
            { key: 'Enter' }
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: /Make a copy/ })
        );
        await waitFor(async () =>
            expect((await adapter.list()).map((d) => d.name)).toContain(
                'Shop (Copy)'
            )
        );
    });

    it('delete asks first and removes the diagram only after confirming', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/diagrams/x', adapter);
        await screen.findByText('Blog');
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Actions for Blog' }),
            { key: 'Enter' }
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: /Delete/ })
        );
        const alert = await screen.findByRole('alertdialog');
        expect((await adapter.list()).length).toBe(2);
        fireEvent.click(within(alert).getByRole('button', { name: 'Delete' }));
        await waitFor(async () =>
            expect((await adapter.list()).map((d) => d.id)).toEqual(['one'])
        );
    });

    it('rename changes the stored name', async () => {
        const adapter = await seeded();
        renderInEditor(<OpenHere />, null, '/diagrams/x', adapter);
        await screen.findByText('Blog');
        fireEvent.keyDown(
            screen.getByRole('button', { name: 'Actions for Blog' }),
            { key: 'Enter' }
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: /Rename/ })
        );
        const input = await screen.findByRole('textbox', {
            name: 'Diagram name',
        });
        fireEvent.change(input, { target: { value: 'Journal' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        await waitFor(async () =>
            expect((await adapter.load('two'))?.design.name).toBe('Journal')
        );
    });
});

describe('New diagram dialog, local mode (SHL-036 to SHL-041)', () => {
    it('picks a database, makes a blank diagram named "Diagram 1" and opens it', async () => {
        const { adapter } = renderInEditor(
            <>
                <CreateDiagramDialog dialog={{ open: true }} />
                <Where />
            </>,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('radio', { name: /PostgreSQL/ })
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Blank diagram instead' })
        );
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        const [stored] = await adapter.list();
        expect(stored.name).toBe('Diagram 1');
        expect(stored.databaseType).toBe('postgresql');
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                `/diagrams/${stored.id}`
            )
        );
    });

    it('with no diagram open it has no close button and no Cancel', async () => {
        renderInEditor(<CreateDiagramDialog dialog={{ open: true }} />, null);
        await screen.findByRole('dialog');
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Open a saved file' })
        ).toBeTruthy();
    });

    it('with a diagram open it can be cancelled', async () => {
        renderInEditor(<CreateDiagramDialog dialog={{ open: true }} />, {
            design: blank(),
        });
        await screen.findByRole('dialog');
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });

    it('imports pasted SQL as the new diagram, the Import button waits for a clean reading', async () => {
        const { adapter } = renderInEditor(
            <>
                <CreateDiagramDialog dialog={{ open: true }} />
                <Where />
            </>,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('radio', { name: /PostgreSQL/ })
        );
        fireEvent.mouseDown(
            await screen.findByRole('tab', { name: 'SQL script' })
        );
        const build = screen.getByRole('button', {
            name: 'Build from text',
        }) as HTMLButtonElement;
        expect(build.disabled).toBe(true);
        fireEvent.change(screen.getByRole('textbox', { name: 'SQL script' }), {
            target: {
                value: 'CREATE TABLE pets (id int primary key, name text);',
            },
        });
        await waitFor(() => expect(build.disabled).toBe(false), {
            timeout: 3000,
        });
        expect(screen.getByTestId('import-counts').textContent).toContain(
            '1 tables'
        );
        fireEvent.click(build);
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        const loaded = await adapter.load((await adapter.list())[0].id);
        expect(loaded?.design.entities.order).toHaveLength(1);
        expect(loaded?.design.name).toBe('Diagram 1');
    });
});
