import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportFromDatabaseDialog } from '../import-from-database-dialog';

const introspectCatalog = vi.fn();
const introspect = vi.fn();
const listSavedConnections = vi.fn();
const saveConnection = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        introspectCatalog: (...a: unknown[]) => introspectCatalog(...a),
        introspect: (...a: unknown[]) => introspect(...a),
        listSavedConnections: (...a: unknown[]) => listSavedConnections(...a),
        saveConnection: (...a: unknown[]) => saveConnection(...a),
    },
}));

const addDiagram = vi.fn();
const deleteDiagram = vi.fn();
vi.mock('@/hooks/use-storage', () => ({
    useStorage: () => ({ addDiagram, deleteDiagram }),
}));

const syncDiagram = vi.fn();
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ syncDiagram }),
}));

vi.mock('@/lib/qubdi/import-from-db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    metadataToDiagram: async (_d: string, _m: unknown, name: string) => ({
        id: 'local-new',
        name,
    }),
}));
vi.mock('@/lib/qubdi/resync', () => ({ snapshotSourceKeys: () => ({}) }));
vi.mock('@/lib/qubdi/sync-state', () => ({ setSyncState: vi.fn() }));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const catalog = {
    database: 'shop',
    schemas: [{ schema: 'public', tables: ['users'], views: [] }],
};

const mount = (open = true) =>
    render(
        <ImportFromDatabaseDialog
            open={open}
            onOpenChange={vi.fn()}
            projectId="p1"
            projectSlug="shop"
        />
    );

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

const fillAndConnect = async () => {
    type('Host', 'db.example.com');
    type('Database', 'shop');
    type('User', 'reader');
    type('Password', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('Choose the schemas and tables to import.');
};

describe('ImportFromDatabaseDialog', () => {
    beforeEach(() => {
        for (const m of [
            introspectCatalog,
            introspect,
            listSavedConnections,
            saveConnection,
            addDiagram,
            deleteDiagram,
            syncDiagram,
            navigate,
        ]) {
            m.mockReset();
        }
        listSavedConnections.mockResolvedValue([]);
        introspectCatalog.mockResolvedValue(catalog);
        introspect.mockResolvedValue({ dialect: 'postgresql', metadata: {} });
        addDiagram.mockResolvedValue(undefined);
        deleteDiagram.mockResolvedValue(undefined);
    });

    const createDiagram = async () => {
        await fillAndConnect();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Create diagram' })
        );
    };

    it('starts from an empty form and the first step when it is opened again', async () => {
        const view = mount();
        await fillAndConnect();
        view.rerender(
            <ImportFromDatabaseDialog
                open={false}
                onOpenChange={vi.fn()}
                projectId="p1"
                projectSlug="shop"
            />
        );
        view.rerender(
            <ImportFromDatabaseDialog
                open
                onOpenChange={vi.fn()}
                projectId="p1"
                projectSlug="shop"
            />
        );
        expect(await screen.findByLabelText('Host')).toHaveProperty(
            'value',
            ''
        );
        expect(screen.getByLabelText('Database')).toHaveProperty('value', '');
        expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
    });

    it('forgets the chosen saved connection when it is opened again', async () => {
        listSavedConnections.mockResolvedValue([
            {
                id: 'c1',
                name: 'Prod',
                dialect: 'postgresql',
                host: 'h',
                port: 5432,
                database: 'd',
                user: 'u',
                ssl: false,
                trustServerCertificate: false,
            },
        ]);
        const props = {
            onOpenChange: vi.fn(),
            projectId: 'p1',
            projectSlug: 'shop',
        };
        const view = render(<ImportFromDatabaseDialog open {...props} />);
        fireEvent.click(
            await screen.findByRole('combobox', { name: 'Saved connection' })
        );
        fireEvent.click(await screen.findByRole('option', { name: 'Prod' }));
        await waitFor(() =>
            expect(screen.getByLabelText('Host')).toHaveProperty('value', 'h')
        );
        view.rerender(<ImportFromDatabaseDialog open={false} {...props} />);
        view.rerender(<ImportFromDatabaseDialog open {...props} />);
        await waitFor(() =>
            expect(screen.getByLabelText('Host')).toHaveProperty('value', '')
        );
        // the host field is editable again: no saved connection is selected
        expect(screen.getByLabelText('Host')).toHaveProperty('disabled', false);
    });

    it('takes the local diagram back when the server refuses to create it', async () => {
        syncDiagram.mockRejectedValue(new Error('down'));
        mount();
        await createDiagram();
        await waitFor(() =>
            expect(deleteDiagram).toHaveBeenCalledWith('local-new')
        );
        expect(addDiagram).toHaveBeenCalledTimes(1);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('keeps the local diagram when the server created it', async () => {
        syncDiagram.mockResolvedValue('remote-1');
        mount();
        await createDiagram();
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(deleteDiagram).not.toHaveBeenCalled();
    });

    it('leaves nothing to delete when reading the database failed', async () => {
        introspect.mockRejectedValue(new Error('refused'));
        mount();
        await createDiagram();
        await waitFor(() => expect(introspect).toHaveBeenCalled());
        expect(addDiagram).not.toHaveBeenCalled();
        expect(deleteDiagram).not.toHaveBeenCalled();
    });
});
