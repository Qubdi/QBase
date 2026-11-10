import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/platform/toast/toaster';
import { LintControl } from '../lint-control';

const addIndex = vi.fn();
const removeIndex = vi.fn();
const updateField = vi.fn();
const updateTable = vi.fn();

const field = (id: string, name: string, primaryKey = false) => ({
    id,
    name,
    type: { id: 'text', name: 'text' },
    primaryKey,
    unique: false,
    nullable: true,
    createdAt: 1,
});
const index = (id: string, name: string) => ({
    id,
    name,
    unique: false,
    fieldIds: ['f2'],
    createdAt: 1,
});
const tables = [
    {
        id: 't1',
        name: 'users',
        fields: [field('f1', 'id', true), field('f2', 'email')],
        indexes: [index('i1', 'idx_a'), index('i2', 'idx_b')],
    },
];

vi.mock('@/qbase/use-diagram', () => ({
    useDiagram: () => ({
        currentDiagram: { id: 'local-1', tables },
        tables,
        databaseType: 'postgresql',
        readonly: false,
        addIndex,
        removeIndex,
        updateField,
        updateTable,
    }),
}));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ remoteIdFor: () => undefined, user: null }),
}));
vi.mock('@/qbase/use-focus-on', () => ({
    useFocusOn: () => ({ focusOnTable: vi.fn() }),
}));
vi.mock('@/qbase/use-layout', () => ({
    useLayout: () => ({
        isSidePanelShowed: true,
        openTableFromSidebar: vi.fn(),
    }),
}));
// the diagram changed since the check ran: the plan no longer fits
vi.mock('@/lib/qubdi/lint-fix', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    planFix: () => null,
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('QBS-046 a stale fix shows a red toast and does nothing', () => {
    it('no edit is made and the notice is destructive', async () => {
        render(
            <>
                <LintControl />
                <Toaster />
            </>
        );
        fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Fix' }));
        const title = await screen.findByText('This fix no longer applies');
        expect(title).toBeInTheDocument();
        await waitFor(() =>
            expect(
                screen.getByText('The diagram changed since the check ran.')
            ).toBeInTheDocument()
        );
        for (const fn of [addIndex, removeIndex, updateField, updateTable])
            expect(fn).not.toHaveBeenCalled();
        expect(screen.queryByText('Fix applied')).toBeNull();
        // the toast is the red (destructive) kind
        expect(title.closest('[data-state]')?.className ?? '').toMatch(
            /destructive/
        );
    });
});
