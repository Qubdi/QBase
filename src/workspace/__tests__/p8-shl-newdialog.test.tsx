import React, { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { blank, withTables } from '@/core/testing/helpers';
import { CreateDiagramDialog } from '@/dialogs/create-diagram-dialog/create-diagram-dialog';
import { ImportBox, QUIET_MS } from '@/features/import/import-box';
import type { ImportBoxState } from '@/features/import/import-box';
import { PICKER_THRESHOLD } from '@/features/import/picker-rows';
import { MemoryStorageAdapter } from '@/persistence/memory-adapter';
import { render } from '@testing-library/react';
import { renderInEditor } from './test-harness';

const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const Toggle: React.FC = () => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button onClick={() => setOpen((o) => !o)}>toggle</button>
            <CreateDiagramDialog dialog={{ open }} />
        </>
    );
};

describe('New diagram dialog, step 1 (SHL-032, SHL-033, SHL-034)', () => {
    it('SHL-033: a database card selects it and goes straight to the import step', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const card = await screen.findByRole('radio', { name: /MySQL/ });
        fireEvent.click(card);
        expect(
            await screen.findByText('Start from existing work')
        ).toBeTruthy();
        expect(screen.queryByRole('radio')).toBeNull();
    });

    it('SHL-032: offers the databases the editor supports as option cards', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        await screen.findByRole('radiogroup');
        const names = screen.getAllByRole('radio').map((r) => r.textContent);
        for (const name of [
            'MySQL',
            'PostgreSQL',
            'MariaDB',
            'SQLite',
            'SQL Server',
            'Oracle',
        ])
            expect(names, name).toContain(name);
    });

    it('SHL-034: Cancel when a diagram is open, "Open a saved file" when none is', async () => {
        const open = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            {
                design: blank(),
            }
        );
        await screen.findByRole('dialog');
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Open a saved file' })
        ).toBeNull();
        open.unmount();
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        await screen.findByRole('dialog');
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Open a saved file' })
        ).toBeTruthy();
    });

    it('SHL-034: the blank-diagram and Continue buttons are there', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        await screen.findByRole('dialog');
        expect(
            screen.getByRole('button', { name: 'Blank diagram' })
        ).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    });
});

describe('New diagram dialog, creating (SHL-035, SHL-036, SHL-038, SHL-039, SHL-040)', () => {
    it('SHL-035: "Blank diagram" makes a blank diagram of the chosen type at once', async () => {
        const adapter = new MemoryStorageAdapter();
        renderInEditor(
            <>
                <CreateDiagramDialog dialog={{ open: true }} />
                <Where />
            </>,
            null,
            '/',
            adapter
        );
        // choose by clicking a card, then go back and create from the chosen card
        fireEvent.click(await screen.findByRole('radio', { name: /SQLite/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
        fireEvent.click(await screen.findByRole('radio', { name: /MariaDB/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Blank diagram' }));
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        expect((await adapter.list())[0].databaseType).toBe('mariadb');
    });

    it('SHL-036: step 2 has Back, the blank-diagram button and the import button', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('radio', { name: /PostgreSQL/ })
        );
        expect(
            await screen.findByRole('button', { name: 'Back' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Blank diagram instead' })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Build from text' })
        ).toBeTruthy();
        // the wizard: query script, SQL, DBML
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
            'Database query',
            'SQL script',
            'DBML',
        ]);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(await screen.findByRole('radiogroup')).toBeTruthy();
    });

    it('SHL-038: a diagram being created keeps the dialog open; with none open it cannot be closed', async () => {
        const adapter = new MemoryStorageAdapter();
        const save = adapter.save.bind(adapter);
        let release: () => void = () => undefined;
        adapter.save = (design) =>
            new Promise((resolve) => {
                release = () => resolve(save(design));
            });
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            { design: blank() },
            '/',
            adapter
        );
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', { name: 'Blank diagram' }));
        // while it works, Escape does not close it
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeTruthy();
        release();
    });

    it('SHL-038: Escape does nothing when no diagram is open', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const dialog = await screen.findByRole('dialog');
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('SHL-039: the new diagram is "Diagram N", N = number of diagrams + 1; it becomes the default; URL follows', async () => {
        const adapter = new MemoryStorageAdapter();
        await adapter.save({ ...withTables(['a']), id: 'one', name: 'One' });
        await adapter.save({ ...withTables(['a']), id: 'two', name: 'Two' });
        renderInEditor(
            <>
                <CreateDiagramDialog dialog={{ open: true }} />
                <Where />
            </>,
            { design: blank() },
            '/diagrams/one',
            adapter
        );
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByRole('button', { name: 'Blank diagram' }));
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(3)
        );
        const made = (await adapter.list()).find(
            (d) => !['one', 'two'].includes(d.id)
        )!;
        expect(made.name).toBe('Diagram 3');
        expect((await adapter.readSettings()).defaultDiagramId).toBe(made.id);
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                `/diagrams/${made.id}`
            )
        );
    });

    it('SHL-040: every opening starts again on step 1', async () => {
        renderInEditor(<Toggle />, { design: blank() }, '/diagrams/x');
        fireEvent.click(
            await screen.findByRole('radio', { name: /PostgreSQL/ })
        );
        await screen.findByText('Start from existing work');
        fireEvent.click(screen.getByText('toggle'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        fireEvent.click(screen.getByText('toggle'));
        expect(
            await screen.findByText('Which database is this for?')
        ).toBeTruthy();
    });
});

describe('a big metadata script asks which tables to bring (SHL-037)', () => {
    const metadata = (tables: number, views = 0) =>
        JSON.stringify({
            database_name: 'big',
            version: '16',
            tables: Array.from({ length: tables }, (_, i) => ({
                schema: 'public',
                table: `t${i}`,
            })),
            views: Array.from({ length: views }, (_, i) => ({
                schema: 'public',
                view_name: `v${i}`,
            })),
            columns: Array.from({ length: tables }, (_, i) => ({
                schema: 'public',
                table: `t${i}`,
                name: 'id',
                type: 'integer',
                ordinal_position: 1,
                nullable: false,
            })),
            pk_info: [],
            fk_info: [],
            indexes: [],
        });
    const show = async (text: string) => {
        let last: ImportBoxState | undefined;
        render(
            <ImportBox
                databaseType="postgresql"
                onChange={(s) => {
                    last = s;
                }}
            />
        );
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: text },
        });
        await waitFor(() => expect(last?.pending).toBe(false), {
            timeout: QUIET_MS + 3000,
        });
        return screen;
    };

    it('the threshold is 50 tables and views together', () => {
        expect(PICKER_THRESHOLD).toBe(50);
    });

    it('50 tables import as they are, with no selection step', async () => {
        await show(metadata(50));
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('51 tables (or 49 tables plus 2 views) show a table selection first', async () => {
        await show(metadata(49, 2));
        expect((await screen.findAllByRole('checkbox')).length).toBeGreaterThan(
            0
        );
    });
});
