import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportFromDatabaseDialog } from '../import-from-database-dialog';

const introspectCatalog = vi.fn();
const introspect = vi.fn();
const listSavedConnections = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        introspectCatalog: (...a: unknown[]) => introspectCatalog(...a),
        introspect: (...a: unknown[]) => introspect(...a),
        listSavedConnections: (...a: unknown[]) => listSavedConnections(...a),
        saveConnection: vi.fn(),
    },
}));
const addDiagram = vi.fn();
vi.mock('@/qbase/use-storage', () => ({
    useStorage: () => ({ addDiagram, deleteDiagram: vi.fn() }),
}));
const syncDiagram = vi.fn();
vi.mock('@/hooks/use-qubdi', () => ({ useQubdi: () => ({ syncDiagram }) }));
vi.mock('@/lib/qubdi/import-from-db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    metadataToDiagram: async (_d: string, _m: unknown, name: string) => ({
        id: 'local-new',
        name,
    }),
}));
vi.mock('@/lib/qubdi/resync', () => ({
    snapshotSourceKeys: () => ({ tables: {}, columns: {} }),
}));
const setSyncState = vi.fn();
vi.mock('@/lib/qubdi/sync-state', () => ({
    setSyncState: (...a: unknown[]) => setSyncState(...a),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const catalog = {
    database: 'shop',
    schemas: [
        { schema: 'public', tables: ['users', 'orders'], views: ['v_users'] },
    ],
};

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
    for (const m of [
        introspectCatalog,
        introspect,
        listSavedConnections,
        addDiagram,
        syncDiagram,
        navigate,
        setSyncState,
    ])
        m.mockReset();
    listSavedConnections.mockResolvedValue([]);
    introspectCatalog.mockResolvedValue(catalog);
    introspect.mockResolvedValue({ dialect: 'postgresql', metadata: {} });
    syncDiagram.mockResolvedValue('remote-1');
});

const mount = () =>
    render(
        <ImportFromDatabaseDialog
            open
            onOpenChange={vi.fn()}
            projectId="p1"
            projectSlug="shop"
        />
    );

describe('IMP-066 the live import wizard', () => {
    it('offers PostgreSQL and SQL Server only', async () => {
        mount();
        fireEvent.click(
            await screen.findByRole('combobox', { name: 'Database type' })
        );
        const names = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(names).toEqual(['PostgreSQL', 'SQL Server']);
    });
    it('runs connect, choose, preview and create in order', async () => {
        mount();
        type('Host', 'db.example.com');
        type('Database', 'shop');
        type('User', 'reader');
        type('Password', 'secret');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByText('Choose the schemas and tables to import.');
        expect(screen.getByText('users')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('Review what will be created.');
        fireEvent.click(screen.getByRole('button', { name: 'Create diagram' }));
        await waitFor(() => expect(navigate).toHaveBeenCalled());
        expect(introspect).toHaveBeenCalledWith(
            expect.objectContaining({
                schemas: ['public'],
                tables: expect.arrayContaining([
                    'public.users',
                    'public.orders',
                ]),
            })
        );
        expect(navigate.mock.calls[0][0]).toContain('remote-1');
    });
});

describe('IMP-067 IMP-072 what the browser remembers', () => {
    it('keeps the source and database names for re-sync but never the password', async () => {
        mount();
        type('Host', 'db.example.com');
        type('Database', 'shop');
        type('User', 'reader');
        type('Password', 'secret-pw-123');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByText('Choose the schemas and tables to import.');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(
            await screen.findByRole('button', { name: 'Create diagram' })
        );
        await waitFor(() => expect(setSyncState).toHaveBeenCalledTimes(1));
        const [id, state] = setSyncState.mock.calls[0];
        expect(id).toBe('local-new');
        expect(state).toMatchObject({
            dialect: 'postgresql',
            source: {
                kind: 'inline',
                connection: {
                    host: 'db.example.com',
                    database: 'shop',
                    user: 'reader',
                },
            },
            schemas: ['public'],
        });
        expect(state.tables.length).toBeGreaterThan(0);
        expect(JSON.stringify(state)).not.toContain('secret-pw-123');
        expect(JSON.stringify(localStorage)).not.toContain('secret-pw-123');
    });
});
