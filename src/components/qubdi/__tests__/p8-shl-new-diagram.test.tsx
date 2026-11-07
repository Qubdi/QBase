import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { ApiError } from '@/lib/qubdi/api';
import { NewDiagramDialog } from '../new-diagram-dialog';

const storage = vi.hoisted(() => ({
    addDiagram: vi.fn(async () => undefined),
    deleteDiagram: vi.fn(async () => undefined),
}));
vi.mock('@/qbase/use-storage', () => ({ useStorage: () => storage }));

beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

const syncDiagram = vi.fn();
const onImport = vi.fn();
const Where: React.FC = () => (
    <div data-testid="where">{useLocation().pathname}</div>
);

const show = (withImport = true) =>
    render(
        <MemoryRouter>
            <qubdiContext.Provider
                value={{ syncDiagram } as unknown as QubdiContext}
            >
                <NewDiagramDialog
                    open
                    onOpenChange={() => undefined}
                    projectId="p1"
                    projectName="Billing"
                    projectSlug="Billing"
                    onImport={withImport ? onImport : undefined}
                />
                <Where />
            </qubdiContext.Provider>
        </MemoryRouter>
    );

beforeEach(() => vi.clearAllMocks());

describe('New diagram in a project (SHL-110)', () => {
    it('is a small form: an optional name up to 200 characters, a type select defaulting to PostgreSQL, Create', () => {
        show();
        const name = screen.getByRole('textbox', {
            name: 'Diagram name',
        }) as HTMLInputElement;
        expect(name.maxLength).toBe(200);
        expect(name.required).toBe(false);
        expect(
            screen.getByRole('combobox', { name: 'Database type' }).textContent
        ).toContain('PostgreSQL');
        expect(
            screen.getByRole('button', { name: 'Create diagram' })
        ).toBeTruthy();
        expect(screen.getByText(/created in Billing/)).toBeTruthy();
    });

    it('offers every database type, Generic included', async () => {
        show();
        fireEvent.keyDown(
            screen.getByRole('combobox', { name: 'Database type' }),
            { key: ' ' }
        );
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).toHaveLength(9);
        for (const label of [
            'Generic',
            'PostgreSQL',
            'MySQL',
            'SQL Server',
            'MariaDB',
            'SQLite',
            'ClickHouse',
            'CockroachDB',
            'Oracle',
        ])
            expect(options, label).toContain(label);
    });

    it('offers "Import from database" when an importer is given', () => {
        const first = show(true);
        fireEvent.click(
            screen.getByRole('button', { name: /Import from database/ })
        );
        expect(onImport).toHaveBeenCalled();
        first.unmount();
        show(false);
        expect(
            screen.queryByRole('button', { name: /Import from database/ })
        ).toBeNull();
    });

    it('creates the local and the server diagram together, then goes to the diagram in its project', async () => {
        syncDiagram.mockResolvedValue('remote-9');
        show();
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Diagram name' }),
            {
                target: { value: 'Ledger' },
            }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Create diagram' }));
        await waitFor(() =>
            expect(screen.getByTestId('where').textContent).toBe(
                '/Billing/diagrams/remote-9'
            )
        );
        expect(storage.addDiagram).toHaveBeenCalledTimes(1);
        const [{ diagram }] = storage.addDiagram.mock.calls[0] as unknown as [
            { diagram: { name: string; databaseType: string } },
        ];
        expect(diagram.name).toBe('Ledger');
        expect(diagram.databaseType).toBe('postgresql');
        expect(syncDiagram).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Ledger' }),
            'p1'
        );
        expect(storage.deleteDiagram).not.toHaveBeenCalled();
    });

    it('a blank name becomes the default name', async () => {
        syncDiagram.mockResolvedValue('r');
        show();
        fireEvent.click(screen.getByRole('button', { name: 'Create diagram' }));
        await waitFor(() => expect(syncDiagram).toHaveBeenCalled());
        const [{ diagram }] = storage.addDiagram.mock.calls[0] as unknown as [
            { diagram: { name: string } },
        ];
        expect(diagram.name).toBe('Untitled diagram');
    });

    it('when the server step fails the local copy is removed again and the error shows in the dialog', async () => {
        syncDiagram.mockRejectedValue(new ApiError(403, 'forbidden'));
        show();
        fireEvent.click(screen.getByRole('button', { name: 'Create diagram' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBeTruthy();
        const [{ diagram }] = storage.addDiagram.mock.calls[0] as unknown as [
            { diagram: { id: string } },
        ];
        expect(storage.deleteDiagram).toHaveBeenCalledWith(diagram.id);
        expect(screen.getByTestId('where').textContent).toBe('/');
    });
});
