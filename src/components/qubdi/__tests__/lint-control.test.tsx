import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LintControl } from '../lint-control';

const focusOnTable = vi.fn();
vi.mock('@/hooks/use-focus-on', () => ({
    useFocusOn: () => ({ focusOnTable }),
}));

const openTableFromSidebar = vi.fn();
let isSidePanelShowed = true;
vi.mock('@/hooks/use-layout', () => ({
    useLayout: () => ({ isSidePanelShowed, openTableFromSidebar }),
}));

// one table without a primary key: a single table-level finding
const tables = [
    {
        id: 't1',
        name: 'audit_log',
        fields: [
            {
                id: 'f1',
                name: 'message',
                type: { name: 'text' },
                primaryKey: false,
                unique: false,
                nullable: true,
            },
        ],
    },
];
vi.mock('@/hooks/use-diagram', () => ({
    useDiagram: () => ({
        currentDiagram: { id: 'local-1', tables },
        tables,
        databaseType: 'postgresql',
    }),
}));

vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ remoteIdFor: () => undefined, user: null }),
}));

const clickFinding = () => {
    fireEvent.click(screen.getByRole('button', { name: /^Lint/ }));
    fireEvent.click(screen.getByTitle('Show on the canvas'));
};

describe('LintControl: clicking a finding', () => {
    beforeEach(() => {
        focusOnTable.mockReset();
        openTableFromSidebar.mockReset();
        isSidePanelShowed = true;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('opens the table in the left panel and zooms to it', () => {
        render(<LintControl />);
        clickFinding();
        expect(openTableFromSidebar).toHaveBeenCalledWith('t1');
        expect(focusOnTable).toHaveBeenCalledWith('t1');
    });

    it('opens the table before it zooms, so a narrow screen ends on the canvas', () => {
        render(<LintControl />);
        clickFinding();
        expect(openTableFromSidebar.mock.invocationCallOrder[0]).toBeLessThan(
            focusOnTable.mock.invocationCallOrder[0]
        );
    });

    it('waits for a hidden panel to finish opening before it zooms', () => {
        isSidePanelShowed = false;
        vi.useFakeTimers();
        render(<LintControl />);
        clickFinding();
        expect(openTableFromSidebar).toHaveBeenCalledWith('t1');
        expect(focusOnTable).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(focusOnTable).toHaveBeenCalledWith('t1');
    });
});
