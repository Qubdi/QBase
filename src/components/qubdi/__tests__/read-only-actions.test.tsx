import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessState } from '@/lib/qubdi/access';
import { DiagramAccessContext } from '../diagram-access-context';
import { LintControl } from '../lint-control';

let readonly = false;
// two identical indexes: one finding with a removal fix
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
        comments: 'people',
        fields: [field('f1', 'id', true), field('f2', 'email')],
        indexes: [index('i1', 'idx_a'), index('i2', 'idx_b')],
    },
];
vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({
        currentDiagram: { id: 'local-1', tables },
        tables,
        databaseType: 'postgresql',
        readonly,
    }),
}));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ remoteIdFor: () => undefined, user: null }),
}));
vi.mock('@/hooks/use-focus-on', () => ({
    useFocusOn: () => ({ focusOnTable: vi.fn() }),
}));
vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({
        isSidePanelShowed: true,
        openTableFromSidebar: vi.fn(),
    }),
}));

const open = () => {
    render(
        <DiagramAccessContext.Provider
            value={{
                access: { status: 'off' } as AccessState,
                refresh: () => undefined,
            }}
        >
            <LintControl />
        </DiagramAccessContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
};

describe('LintControl fixes on a read-only diagram', () => {
    beforeEach(() => {
        readonly = false;
    });

    it('offers Fix when the diagram can be edited', () => {
        open();
        expect(screen.getAllByRole('button', { name: 'Fix' }).length).toBe(1);
    });

    it('hides Fix for a viewer or an editor who lost the lock', () => {
        readonly = true;
        open();
        expect(screen.getByText(/idx_b/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Fix' })).toBeNull();
    });
});
