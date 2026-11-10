import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { DiagramAccessContext } from '../diagram-access-context';
import { AccountMenu } from '../account-menu';

vi.mock('../resync-dialog', () => ({
    ResyncDialog: ({ open }: { open: boolean }) => (
        <p data-testid="resync">{open ? 'open' : 'closed'}</p>
    ),
}));
vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({
        currentDiagram: { id: 'local-1', tables: [] },
        getCurrentDiagram: () => ({ id: 'local-1', tables: [] }),
        tables: [],
        databaseType: 'postgresql',
    }),
}));
vi.mock('@/hooks/use-mfa-available', () => ({ useMfaAvailable: () => false }));

const tree = (status: 'editor' | 'viewer') => (
    <MemoryRouter>
        <qubdiContext.Provider
            value={
                {
                    enabled: true,
                    user: { email: 'a@b.c', isAdmin: false },
                    remoteIdFor: () => 'r1',
                } as unknown as QubdiContext
            }
        >
            <DiagramAccessContext.Provider
                value={{
                    access: {
                        status,
                        projectId: 'p1',
                        remoteId: 'r1',
                    } as never,
                    refresh: () => undefined,
                }}
            >
                <AccountMenu />
            </DiagramAccessContext.Provider>
        </qubdiContext.Provider>
    </MemoryRouter>
);

describe('QBS-029 the drift report can ask for a re-sync through qubdi:open-resync', () => {
    it('an editor gets the re-sync dialog', () => {
        render(tree('editor'));
        expect(screen.getByTestId('resync')).toHaveTextContent('closed');
        act(() => {
            window.dispatchEvent(new Event('qubdi:open-resync'));
        });
        expect(screen.getByTestId('resync')).toHaveTextContent('open');
    });

    it('a viewer does not: nothing opens', () => {
        render(tree('viewer'));
        act(() => {
            window.dispatchEvent(new Event('qubdi:open-resync'));
        });
        expect(screen.getByTestId('resync')).toHaveTextContent('closed');
    });
});
