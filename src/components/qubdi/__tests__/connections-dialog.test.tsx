import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type SavedConnection } from '@/lib/qubdi/api';
import { ConnectionsDialog } from '../connections-dialog';

const listSaved = vi.fn();
const saveConnection = vi.fn();
const updateConnection = vi.fn();
const deleteSaved = vi.fn();
const catalog = vi.fn();
const capabilities = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listSavedConnections: (...a: unknown[]) => listSaved(...a),
        saveConnection: (...a: unknown[]) => saveConnection(...a),
        updateConnection: (...a: unknown[]) => updateConnection(...a),
        deleteSavedConnection: (...a: unknown[]) => deleteSaved(...a),
        introspectCatalog: (...a: unknown[]) => catalog(...a),
        introspectCapabilities: (...a: unknown[]) => capabilities(...a),
    },
}));

const conn = (n: number, over: Partial<SavedConnection> = {}) =>
    ({
        id: `c${n}`,
        name: `Connection ${n}`,
        dialect: 'postgresql',
        host: `db${n}.corp.io`,
        port: 5432,
        database: 'shop',
        user: 'reader',
        ssl: false,
        trustServerCertificate: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        ...over,
    }) as SavedConnection;

const project = { id: 'p1', name: 'Billing' };

/** renders the dialog and lets its first requests settle */
const show = async (onChanged = vi.fn()) => {
    await act(async () => {
        render(
            <ConnectionsDialog
                open
                onOpenChange={vi.fn()}
                project={project}
                onChanged={onChanged}
            />
        );
    });
    return { onChanged };
};

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

const fillNew = () => {
    type('Name', '  Production  ');
    type('Host', 'db.corp.io');
    type('Database', 'shop');
    type('User', 'reader');
    type('Password', 'secret');
};

const submit = () =>
    act(async () => {
        fireEvent.submit(screen.getByTestId('connection-form'));
    });

describe('ConnectionsDialog', () => {
    beforeEach(() => {
        listSaved.mockReset().mockResolvedValue([conn(1), conn(2)]);
        saveConnection.mockReset().mockResolvedValue(conn(3));
        updateConnection.mockReset().mockResolvedValue(conn(1));
        deleteSaved.mockReset().mockResolvedValue(undefined);
        catalog.mockReset().mockResolvedValue({
            dialect: 'postgresql',
            database: 'shop',
            schemas: [{ schema: 'public', tables: [], views: [] }],
        });
        capabilities.mockReset().mockResolvedValue({ savedConnections: true });
    });

    describe('the list', () => {
        it("shows the project's connections and where each one points", async () => {
            await show();
            expect(listSaved).toHaveBeenCalledWith('p1');
            const list = screen.getByRole('list', { name: 'Connections' });
            expect(within(list).getAllByRole('listitem')).toHaveLength(2);
            expect(list.textContent).toContain('Connection 1');
            expect(list.textContent).toContain(
                'PostgreSQL · db1.corp.io:5432/shop · reader'
            );
        });

        it('says so when there are none', async () => {
            listSaved.mockResolvedValue([]);
            await show();
            expect(screen.getByText('No connections yet.')).toBeTruthy();
        });

        it('names the project it saves for', async () => {
            await show();
            expect(screen.getByRole('dialog').textContent).toContain(
                'Saved for Billing'
            );
        });

        it('shows why when the server cannot store passwords, and offers no way to add', async () => {
            capabilities.mockResolvedValue({ savedConnections: false });
            await show();
            expect(screen.getByRole('alert').textContent).toContain(
                'CONNECTION_KEY'
            );
            expect(
                (
                    screen.getByRole('button', {
                        name: 'Add connection',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(true);
        });

        it('lets an older server try, since it cannot say', async () => {
            capabilities.mockRejectedValue(new ApiError(404, 'not_found'));
            await show();
            expect(screen.queryByRole('alert')).toBeNull();
            expect(
                (
                    screen.getByRole('button', {
                        name: 'Add connection',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(false);
        });

        it('shows a failure to load', async () => {
            listSaved.mockRejectedValue(new ApiError(403, 'forbidden'));
            await show();
            expect(screen.getByRole('alert').textContent).toMatch(
                /do not have permission/i
            );
        });
    });

    describe('adding', () => {
        const open = async () => {
            const shown = await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add connection' })
            );
            return shown;
        };

        it('saves what was typed, trimmed, in this project', async () => {
            const { onChanged } = await open();
            fillNew();
            await submit();
            expect(saveConnection).toHaveBeenCalledWith({
                name: 'Production',
                projectId: 'p1',
                dialect: 'postgresql',
                host: 'db.corp.io',
                port: 5432,
                database: 'shop',
                user: 'reader',
                password: 'secret',
                ssl: false,
                trustServerCertificate: false,
            });
            // back on the list, which was reloaded
            expect(
                screen.getByRole('list', { name: 'Connections' })
            ).toBeTruthy();
            expect(listSaved).toHaveBeenCalledTimes(2);
            expect(onChanged).toHaveBeenCalledTimes(1);
        });

        it('starts empty, on the usual PostgreSQL port', async () => {
            await open();
            expect(
                (screen.getByLabelText('Port') as HTMLInputElement).value
            ).toBe('5432');
            expect(
                (screen.getByLabelText('Host') as HTMLInputElement).value
            ).toBe('');
            expect(
                (screen.getByLabelText('Password') as HTMLInputElement).required
            ).toBe(true);
        });

        it('shows what the server said when it refuses', async () => {
            saveConnection.mockRejectedValue(new ApiError(409, 'name_taken'));
            const { onChanged } = await open();
            fillNew();
            await submit();
            expect(screen.getByRole('alert').textContent).toBe(
                'That name is already in use.'
            );
            // still on the form, nothing changed
            expect(screen.getByTestId('connection-form')).toBeTruthy();
            expect(onChanged).not.toHaveBeenCalled();
        });

        it('goes back to the list without saving', async () => {
            await open();
            fillNew();
            fireEvent.click(screen.getByRole('button', { name: 'Back' }));
            expect(saveConnection).not.toHaveBeenCalled();
            expect(
                screen.getByRole('list', { name: 'Connections' })
            ).toBeTruthy();
        });
    });

    describe('testing a connection', () => {
        const open = async () => {
            await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add connection' })
            );
            fillNew();
        };
        const testButton = () =>
            screen.getByRole('button', {
                name: 'Test connection',
            }) as HTMLButtonElement;

        it('needs the password, since a saved one is never sent back', async () => {
            await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add connection' })
            );
            expect(testButton().disabled).toBe(true);
            type('Password', 'secret');
            expect(testButton().disabled).toBe(false);
        });

        it('connects with what is on the form and reports what it found', async () => {
            await open();
            await act(async () => {
                fireEvent.click(testButton());
            });
            expect(catalog).toHaveBeenCalledWith({
                connection: expect.objectContaining({
                    host: 'db.corp.io',
                    database: 'shop',
                    user: 'reader',
                    password: 'secret',
                }),
            });
            expect(screen.getByRole('status').textContent).toBe(
                'Connected to shop. Found 1 schema.'
            );
            expect(saveConnection).not.toHaveBeenCalled();
        });

        it('reports a failure', async () => {
            catalog.mockRejectedValue(
                new ApiError(400, 'target_blocked', 'That host is not allowed.')
            );
            await open();
            await act(async () => {
                fireEvent.click(testButton());
            });
            // the server's own wording is not shown; the code is translated
            expect(screen.getByRole('alert').textContent).toBe(
                'This database address is not allowed. Ask an admin to allow its host.'
            );
        });

        it('forgets an old result once the form changes', async () => {
            await open();
            await act(async () => {
                fireEvent.click(testButton());
            });
            expect(screen.getByRole('status')).toBeTruthy();
            type('Host', 'elsewhere.corp.io');
            expect(screen.queryByRole('status')).toBeNull();
        });
    });

    describe('editing', () => {
        const edit = async (name = 'Connection 1') => {
            const shown = await show();
            fireEvent.click(
                screen.getByRole('button', { name: `Edit ${name}` })
            );
            return shown;
        };

        it('fills in the saved settings but not the password', async () => {
            listSaved.mockResolvedValue([
                conn(1, { host: 'db.corp.io', port: 6543, ssl: true }),
            ]);
            await edit();
            expect(
                (screen.getByLabelText('Name') as HTMLInputElement).value
            ).toBe('Connection 1');
            expect(
                (screen.getByLabelText('Host') as HTMLInputElement).value
            ).toBe('db.corp.io');
            expect(
                (screen.getByLabelText('Port') as HTMLInputElement).value
            ).toBe('6543');
            const password = screen.getByLabelText(
                'Password'
            ) as HTMLInputElement;
            expect(password.value).toBe('');
            expect(password.required).toBe(false);
            expect(password.placeholder).toMatch(/keep the saved one/);
        });

        it('keeps the saved password when none is typed', async () => {
            const { onChanged } = await edit();
            type('Host', 'new-host.corp.io');
            await submit();
            expect(updateConnection).toHaveBeenCalledTimes(1);
            const [id, body] = updateConnection.mock.calls[0];
            expect(id).toBe('c1');
            expect(body).toMatchObject({
                name: 'Connection 1',
                host: 'new-host.corp.io',
            });
            expect(body).not.toHaveProperty('password');
            expect(saveConnection).not.toHaveBeenCalled();
            expect(onChanged).toHaveBeenCalledTimes(1);
        });

        it('sends a new password when one is typed', async () => {
            await edit();
            type('Password', 'brand-new');
            await submit();
            expect(updateConnection.mock.calls[0][1]).toMatchObject({
                password: 'brand-new',
            });
        });

        it('still saves plain settings when the server has no key, but not a new password', async () => {
            capabilities.mockResolvedValue({ savedConnections: false });
            await edit();
            const save = () =>
                screen.getByRole('button', {
                    name: 'Save',
                }) as HTMLButtonElement;
            expect(save().disabled).toBe(false);
            type('Password', 'brand-new');
            expect(save().disabled).toBe(true);
            type('Password', '');
            expect(save().disabled).toBe(false);
        });

        it('edits the one that was chosen', async () => {
            await edit('Connection 2');
            await submit();
            expect(updateConnection.mock.calls[0][0]).toBe('c2');
        });
    });

    describe('deleting', () => {
        const ask = async () => {
            const shown = await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Delete Connection 1' })
            );
            return shown;
        };

        it('asks first, naming the connection', async () => {
            await ask();
            const confirm = screen.getByRole('alertdialog');
            expect(confirm.textContent).toContain('"Connection 1"');
            expect(confirm.textContent).toContain('Billing');
            expect(deleteSaved).not.toHaveBeenCalled();
        });

        it('keeps the connection when cancelled', async () => {
            await ask();
            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(deleteSaved).not.toHaveBeenCalled();
        });

        it('deletes it on confirm and reloads the list', async () => {
            const { onChanged } = await ask();
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
            });
            expect(deleteSaved).toHaveBeenCalledWith('c1');
            expect(listSaved).toHaveBeenCalledTimes(2);
            expect(onChanged).toHaveBeenCalledTimes(1);
        });

        it('says so when the server refuses', async () => {
            deleteSaved.mockRejectedValue(new ApiError(403, 'forbidden'));
            await ask();
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
            });
            expect(screen.getByRole('alert').textContent).toMatch(
                /do not have permission/i
            );
        });
    });
});
