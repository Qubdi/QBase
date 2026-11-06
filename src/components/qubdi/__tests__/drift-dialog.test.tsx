import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import {
    ApiError,
    type DriftOverview,
    type DriftReport,
    type MyProject,
    type SavedConnection,
} from '@/lib/qubdi/api';
import { registerFlushNow } from '@/lib/qubdi/save-status-store';
import { DriftDialog } from '../drift-dialog';
import { WorkspaceContext, type Workspace } from '../workspace-context';

const listSaved = vi.fn();
const getDrift = vi.fn();
const getDriftReport = vi.fn();
const saveDrift = vi.fn();
const checkDrift = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listSavedConnections: (...a: unknown[]) => listSaved(...a),
        getDrift: (...a: unknown[]) => getDrift(...a),
        getDriftReport: (...a: unknown[]) => getDriftReport(...a),
        saveDrift: (...a: unknown[]) => saveDrift(...a),
        checkDrift: (...a: unknown[]) => checkDrift(...a),
    },
}));
vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: 'local-1', name: 'Shop' } }),
}));
// OptionSelect has the shape of a native select. Radix's own, under happy-dom,
// reports an empty change whenever its value is set from code.
vi.mock('@/components/option-select/option-select', () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        ...rest
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        'aria-label'?: string;
    }) => (
        <select
            aria-label={rest['aria-label']}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));
// the connections screen has its own tests: here it only has to open and report changes
vi.mock('../connections-dialog', () => ({
    ConnectionsDialog: ({
        open,
        project,
        onChanged,
    }: {
        open: boolean;
        project: { id: string; name: string };
        onChanged: () => void;
    }) =>
        open ? (
            <div data-testid="connections-stub">
                {project.name}
                <button data-testid="connections-changed" onClick={onChanged}>
                    changed
                </button>
            </div>
        ) : null,
}));

const conn = (n: number) =>
    ({ id: `c${n}`, name: `Connection ${n}` }) as SavedConnection;

const overview = (over: Partial<DriftOverview> = {}): DriftOverview => ({
    settings: null,
    latest: null,
    badge: null,
    ...over,
});

const report = (over: Partial<DriftReport> = {}): DriftReport =>
    ({
        id: 'r1',
        runAt: '2026-03-10T12:00:00.000Z',
        status: 'clean',
        trigger: 'manual',
        counts: { breaking: 0, warning: 0, info: 0 },
        error: null,
        dismissedAt: null,
        webhook: null,
        changes: [],
        renameHints: [],
        ...over,
    }) as DriftReport;

const workspace: Workspace = {
    project: { id: 'p1', name: 'Billing', slug: 'Billing' } as MyProject,
    localDiagramId: 'local-1',
    remoteDiagramId: 'r1',
};

// the dialog loads the connections and then the drift settings: let it finish
const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const syncOrder: string[] = [];

const show = async () => {
    const onBadgeChange = vi.fn();
    await act(async () => {
        render(
            <qubdiContext.Provider
                value={
                    {
                        syncDiagram: async () => {
                            syncOrder.push('sync');
                            return 'r1';
                        },
                        remoteIdFor: () => 'r1',
                    } as unknown as QubdiContext
                }
            >
                <WorkspaceContext.Provider value={workspace}>
                    <DriftDialog
                        open
                        onOpenChange={vi.fn()}
                        onBadgeChange={onBadgeChange}
                    />
                </WorkspaceContext.Provider>
            </qubdiContext.Provider>
        );
    });
    await settle();
    return { onBadgeChange };
};

const checkNow = () =>
    screen.getByRole('button', { name: 'Check now' }) as HTMLButtonElement;

describe('DriftDialog', () => {
    beforeEach(() => {
        listSaved.mockReset().mockResolvedValue([conn(1), conn(2)]);
        getDrift.mockReset().mockResolvedValue(overview());
        getDriftReport.mockReset().mockResolvedValue(report());
        saveDrift.mockReset().mockResolvedValue({});
        checkDrift.mockReset().mockResolvedValue(report());
        localStorage.clear();
        syncOrder.length = 0;
    });

    it('has no schedule: a check is something you ask for', async () => {
        await show();
        expect(screen.queryByLabelText('Schedule')).toBeNull();
        expect(screen.queryByLabelText('Cron expression')).toBeNull();
        expect(screen.queryByText(/schedule/i)).toBeNull();
    });

    it('needs a connection before it can check', async () => {
        await show();
        expect(checkNow().disabled).toBe(true);
    });

    it('uses the connection remembered with the diagram', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c2',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookHost: 'hooks.example.com',
                },
            })
        );
        await show();
        expect(checkNow().disabled).toBe(false);
        // the saved URL stays on the server: the field is empty and shows the host
        const field = screen.getByLabelText('Webhook URL') as HTMLInputElement;
        expect(field.value).toBe('');
        expect(field.placeholder).toBe(
            'Webhook saved for hooks.example.com: type a new URL to replace it'
        );
    });

    it('leaves the saved webhook alone unless it is edited', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookHost: 'hooks.example.com',
                },
            })
        );
        checkDrift.mockResolvedValue(report({ status: 'clean', changes: [] }));
        await show();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(saveDrift.mock.calls[0][1]).not.toHaveProperty('webhookUrl');
    });

    it('removes a saved webhook with the Remove button, on the next check', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookHost: 'hooks.example.com',
                },
            })
        );
        checkDrift.mockResolvedValue(report({ status: 'clean', changes: [] }));
        await show();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Remove webhook',
            })
        );
        const field = screen.getByLabelText('Webhook URL') as HTMLInputElement;
        expect(field.placeholder).toBe(
            'The saved webhook is removed the next time you press Check now'
        );
        expect(
            screen.queryByRole('button', {
                name: 'Remove webhook',
            })
        ).toBeNull();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(saveDrift.mock.calls[0][1]).toMatchObject({ webhookUrl: null });
        // gone from the server now: no button, the plain placeholder again
        expect(field.placeholder).toBe(
            'Webhook URL (optional): receives a JSON POST when drift is found'
        );
    });

    it('offers no Remove button when no webhook is saved', async () => {
        await show();
        expect(
            screen.queryByRole('button', {
                name: 'Remove webhook',
            })
        ).toBeNull();
    });

    it('sends the scope the server already holds when this browser has no sync state', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: ['sales'],
                    tables: ['sales.orders'],
                    sourceKeys: {
                        tables: { t1: 'sales.orders' },
                        columns: { f1: 'sales.orders.id' },
                    },
                },
            })
        );
        checkDrift.mockResolvedValue(report({ status: 'clean', changes: [] }));
        localStorage.clear(); // no sync state for this diagram here
        await show();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(saveDrift.mock.calls[0][1]).toMatchObject({
            schemas: ['sales'],
            tables: ['sales.orders'],
            sourceKeys: {
                tables: { t1: 'sales.orders' },
                columns: { f1: 'sales.orders.id' },
            },
        });
    });

    it('saves what to compare with, then checks, in one step', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: ['public'],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookUrl: null,
                },
            })
        );
        const order: string[] = [];
        saveDrift.mockImplementation(async () => void order.push('save'));
        checkDrift.mockImplementation(async () => {
            order.push('check');
            return report({ status: 'drifted', changes: [] });
        });
        const { onBadgeChange } = await show();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(order).toEqual(['save', 'check']);
        const [id, saved] = saveDrift.mock.calls[0];
        expect(id).toBe('r1');
        expect(saved).toMatchObject({ connectionId: 'c1' });
        expect(saved).not.toHaveProperty('webhookUrl');
        // nothing about a schedule is sent
        expect(saved).not.toHaveProperty('enabled');
        expect(saved).not.toHaveProperty('schedule');
        expect(screen.getByTestId('drift-status')).toBeTruthy();
        expect(onBadgeChange).toHaveBeenCalled();
    });

    it('lets the autosaver send its edits before it syncs the diagram', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookUrl: null,
                },
            })
        );
        registerFlushNow(async () => void syncOrder.push('autosaver'));
        try {
            await show();
            await act(async () => {
                fireEvent.click(checkNow());
            });
            await settle();
            expect(syncOrder).toEqual(['autosaver', 'sync']);
        } finally {
            registerFlushNow(null);
        }
    });

    it('reports a clean database', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookUrl: null,
                },
            })
        );
        await show();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(screen.getByTestId('drift-status').textContent).toBe('no drift');
    });

    it('shows what the server said when the check cannot run', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookUrl: null,
                },
            })
        );
        checkDrift.mockRejectedValue(new ApiError(400, 'connection_required'));
        await show();
        await act(async () => {
            fireEvent.click(checkNow());
        });
        await settle();
        expect(screen.getByRole('alert').textContent).toBe(
            'Choose a saved connection first.'
        );
        expect(screen.queryByTestId('drift-report')).toBeNull();
    });

    describe('without a saved connection', () => {
        beforeEach(() => listSaved.mockResolvedValue([]));

        it('says so, and offers to add one', async () => {
            await show();
            expect(
                screen.getByText(/no saved connection in this project yet/i)
            ).toBeTruthy();
            expect(
                screen.getByRole('button', { name: 'Add a connection' })
            ).toBeTruthy();
            expect(checkNow().disabled).toBe(true);
        });

        it('opens the connections of this project', async () => {
            await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add a connection' })
            );
            expect(
                screen.getByTestId('connections-stub').textContent
            ).toContain('Billing');
        });

        it('picks the connection that was just added, so it can be checked at once', async () => {
            await show();
            fireEvent.click(
                screen.getByRole('button', { name: 'Add a connection' })
            );
            listSaved.mockResolvedValue([conn(7)]);
            await act(async () => {
                fireEvent.click(screen.getByTestId('connections-changed'));
            });
            await settle();
            expect(checkNow().disabled).toBe(false);
            expect(
                screen.getByRole('button', { name: 'Manage connections' })
            ).toBeTruthy();
        });
    });

    it('lets the user manage connections when there already are some', async () => {
        await show();
        expect(
            screen.getByRole('button', { name: 'Manage connections' })
        ).toBeTruthy();
        expect(screen.queryByText(/no saved connection/i)).toBeNull();
    });

    it('forgets a chosen connection that was deleted', async () => {
        getDrift.mockResolvedValue(
            overview({
                settings: {
                    connectionId: 'c1',
                    schemas: [],
                    tables: [],
                    sourceKeys: { tables: {}, columns: {} },
                    webhookUrl: null,
                },
            })
        );
        await show();
        expect(checkNow().disabled).toBe(false);
        fireEvent.click(
            screen.getByRole('button', { name: 'Manage connections' })
        );
        listSaved.mockResolvedValue([conn(2)]);
        await act(async () => {
            fireEvent.click(screen.getByTestId('connections-changed'));
        });
        await settle();
        expect(checkNow().disabled).toBe(true);
    });
});
