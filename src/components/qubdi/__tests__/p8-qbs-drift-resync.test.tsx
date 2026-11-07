import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { DriftReport, MyProject } from '@/lib/qubdi/api';
import { setSyncState } from '@/lib/qubdi/sync-state';
import { DriftDialog } from '../drift-dialog';
import { WorkspaceContext, type Workspace } from '../workspace-context';

const report = {
    id: 'r1',
    runAt: '2026-03-10T12:00:00.000Z',
    status: 'drifted',
    trigger: 'manual',
    counts: { breaking: 1, warning: 0, info: 0 },
    error: null,
    dismissedAt: null,
    webhook: null,
    changes: [],
    renameHints: [],
} as unknown as DriftReport;

vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        listSavedConnections: async () => [{ id: 'c1', name: 'Connection 1' }],
        getDrift: async () => ({
            settings: {
                connectionId: 'c1',
                schemas: [],
                tables: [],
                sourceKeys: { tables: {}, columns: {} },
                webhookUrl: null,
            },
            latest: report,
            badge: 'breaking',
        }),
        getDriftReport: async () => report,
    },
}));
vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: 'local-1', name: 'Shop' } }),
}));

const workspace: Workspace = {
    project: { id: 'p1', name: 'Billing', slug: 'Billing' } as MyProject,
    localDiagramId: 'local-1',
    remoteDiagramId: 'r1',
};

const show = async (onOpenChange = vi.fn()) => {
    await act(async () => {
        render(
            <qubdiContext.Provider
                value={
                    {
                        syncDiagram: async () => 'r1',
                        remoteIdFor: () => 'r1',
                    } as unknown as QubdiContext
                }
            >
                <WorkspaceContext.Provider value={workspace}>
                    <DriftDialog
                        open
                        onOpenChange={onOpenChange}
                        onBadgeChange={vi.fn()}
                    />
                </WorkspaceContext.Provider>
            </qubdiContext.Provider>
        );
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    return onOpenChange;
};

beforeEach(() => localStorage.clear());

describe('QBS-045 the drift dialog can start a re-sync', () => {
    it('Update diagram from database closes the dialog and raises qubdi:open-resync', async () => {
        setSyncState('local-1', {
            dialect: 'postgresql',
            source: { kind: 'saved', savedConnectionId: 'c1' },
            tables: [],
            schemas: [],
            sourceKeys: { tables: {}, columns: {} },
            lastSyncedAt: new Date(0).toISOString(),
        });
        const heard = vi.fn();
        window.addEventListener('qubdi:open-resync', heard);
        const onOpenChange = await show();
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Update diagram from database',
            })
        );
        window.removeEventListener('qubdi:open-resync', heard);
        expect(heard).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('without a stored database source the button is off', async () => {
        await show();
        const button = (await screen.findByRole('button', {
            name: 'Update diagram from database',
        })) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });
});
