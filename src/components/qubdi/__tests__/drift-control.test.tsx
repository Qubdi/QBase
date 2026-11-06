import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { DriftBadge, DriftOverview } from '@/lib/qubdi/api';
import { DriftControl } from '../drift-control';
import { DiagramAccessContext } from '../diagram-access-context';
import type { AccessState } from '@/lib/qubdi/access';

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
vi.mock('@/qbase/use-diagram', () => ({
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

const editor: AccessState = {
    status: 'editor',
    projectId: 'p1',
    remoteId: 'r1',
};

const tree = (
    user: unknown = { email: 'a@b.c' },
    access: AccessState = editor
) => (
    <qubdiContext.Provider
        value={
            {
                enabled: true,
                user,
                remoteIdFor: (id: string) => remoteIds[id],
            } as unknown as QubdiContext
        }
    >
        <DiagramAccessContext.Provider
            value={{ access, refresh: () => undefined }}
        >
            <DriftControl />
        </DiagramAccessContext.Provider>
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

describe('DriftControl for people who cannot edit', () => {
    it.each([
        ['a viewer', { status: 'viewer', projectId: 'p1', remoteId: 'r1' }],
        [
            'an editor who lost the lock',
            {
                status: 'taken',
                projectId: 'p1',
                remoteId: 'r1',
                holder: 'sam@b.c',
            },
        ],
    ] as const)(
        'shows nothing, and asks the server nothing, for %s',
        async (_who, access) => {
            getDrift.mockReset();
            const view = render(
                tree({ email: 'a@b.c' }, access as unknown as AccessState)
            );
            await settle();
            expect(view.container.textContent).toBe('');
            expect(getDrift).not.toHaveBeenCalled();
        }
    );
});

describe('DriftControl polling', () => {
    const setHidden = (hidden: boolean) =>
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => hidden,
        });

    it('skips the minute poll while the tab is hidden and refreshes when it is shown again', async () => {
        vi.useFakeTimers();
        try {
            getDrift.mockReset();
            getDrift.mockResolvedValue({ badge: null });
            render(tree());
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
            const afterOpen = getDrift.mock.calls.length;
            setHidden(true);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(180_000);
            });
            expect(getDrift.mock.calls.length).toBe(afterOpen);
            setHidden(false);
            await act(async () => {
                document.dispatchEvent(new Event('visibilitychange'));
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getDrift.mock.calls.length).toBe(afterOpen + 1);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(60_000);
            });
            expect(getDrift.mock.calls.length).toBe(afterOpen + 2);
        } finally {
            setHidden(false);
            vi.useRealTimers();
        }
    });
});
