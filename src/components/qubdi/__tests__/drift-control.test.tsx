import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { DriftBadge, DriftOverview } from '@/lib/qubdi/api';
import { DriftControl } from '../drift-control';

const getDrift = vi.fn();
const checkDrift = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        getDrift: (...a: unknown[]) => getDrift(...a),
        checkDrift: (...a: unknown[]) => checkDrift(...a),
    },
}));

let currentId = 'local-1';
vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({ currentDiagram: { id: currentId } }),
}));

// the dialog has its own tests
vi.mock('../drift-dialog', () => ({ DriftDialog: () => null }));

const remoteIds: Record<string, string | undefined> = {
    'local-1': 'r1',
    'local-2': 'r2',
    'local-only': undefined,
};

const badge: DriftBadge = {
    status: 'drifted',
    counts: { breaking: 2, warning: 0, info: 0 },
    reportId: 'rep1',
};

const configured = (over: Partial<DriftOverview> = {}): DriftOverview => ({
    settings: {
        connectionId: 'c1',
        schemas: [],
        tables: [],
        sourceKeys: { tables: {}, columns: {} },
        webhookUrl: null,
    },
    latest: null,
    badge: null,
    ...over,
});

const tree = (user: unknown = { email: 'a@b.c' }) => (
    <qubdiContext.Provider
        value={
            {
                enabled: true,
                user,
                remoteIdFor: (id: string) => remoteIds[id],
            } as unknown as QubdiContext
        }
    >
        <DriftControl />
    </qubdiContext.Provider>
);

const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

const show = async (user?: unknown) => {
    const view = render(tree(user));
    await settle();
    return view;
};

describe('DriftControl when a diagram is opened', () => {
    beforeEach(() => {
        currentId = 'local-1';
        getDrift.mockReset().mockResolvedValue(configured());
        checkDrift.mockReset().mockResolvedValue({ badge: null });
    });

    it('fetches from the database and shows what differs', async () => {
        checkDrift.mockResolvedValue({ badge });
        await show();
        expect(checkDrift).toHaveBeenCalledTimes(1);
        // a recent report may be handed back instead of reading the database again
        expect(checkDrift).toHaveBeenCalledWith('r1', { cached: true });
        expect(screen.getByTestId('drift-badge').textContent).toBe('Drift: 2');
    });

    it('clears a stored badge when the check finds the database matches', async () => {
        getDrift.mockResolvedValue(configured({ badge }));
        checkDrift.mockResolvedValue({ badge: null });
        await show();
        expect(screen.queryByTestId('drift-badge')).toBeNull();
    });

    it('does not check a diagram with no saved connection', async () => {
        getDrift.mockResolvedValue(configured({ settings: null }));
        await show();
        expect(checkDrift).not.toHaveBeenCalled();
    });

    it('does not check a diagram that is not on the server', async () => {
        currentId = 'local-only';
        await show();
        expect(getDrift).not.toHaveBeenCalled();
        expect(checkDrift).not.toHaveBeenCalled();
    });

    it('does not check when signed out', async () => {
        await show(null);
        expect(checkDrift).not.toHaveBeenCalled();
    });

    it('checks once for an open diagram, however often it renders', async () => {
        const { rerender } = await show();
        rerender(tree());
        rerender(tree({ email: 'a@b.c' }));
        await settle();
        expect(checkDrift).toHaveBeenCalledTimes(1);
    });

    it('checks the next diagram that is opened', async () => {
        const { rerender } = await show();
        currentId = 'local-2';
        rerender(tree());
        await settle();
        expect(checkDrift.mock.calls.map((c) => c[0])).toEqual(['r1', 'r2']);
    });

    it('keeps the stored badge when the check cannot run', async () => {
        getDrift.mockResolvedValue(configured({ badge }));
        checkDrift.mockRejectedValue(new Error('offline'));
        await show();
        expect(screen.getByTestId('drift-badge').textContent).toBe('Drift: 2');
    });
});
