import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/tooltip/tooltip';
import { Toolbar } from '../toolbar';

vi.mock('@/hooks/use-history', () => ({
    useHistory: () => ({
        redo: vi.fn(),
        undo: vi.fn(),
        hasRedo: true,
        hasUndo: true,
    }),
}));
vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({
        getZoom: () => 1,
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        fitView: vi.fn(),
    }),
    useOnViewportChange: () => undefined,
}));
vi.mock('@/hooks/use-canvas', () => ({
    useCanvas: () => ({ setShowFilter: vi.fn(), reorderTables: vi.fn() }),
}));
vi.mock('@/context/diagram-filter-context/use-diagram-filter', () => ({
    useDiagramFilter: () => ({ hasActiveFilter: false }),
}));
vi.mock('@/context/alert-context/alert-context', () => ({
    useAlert: () => ({ showAlert: vi.fn() }),
}));

const show = (readonly?: boolean) =>
    render(
        <TooltipProvider>
            <Toolbar readonly={readonly} />
        </TooltipProvider>
    );

describe('Toolbar', () => {
    it('names every icon-only button, since the tooltips show nothing', () => {
        show();
        const buttons = screen.getAllByRole('button');
        const unnamed = buttons.filter(
            (b) => !b.textContent?.trim() && !b.getAttribute('aria-label')
        );
        expect(unnamed).toEqual([]);
        // search, show all, zoom out, zoom in, reorder, undo and redo, plus the zoom level
        expect(buttons).toHaveLength(8);
    });

    it('leaves out the reorder button when the diagram is read-only', () => {
        show(true);
        expect(screen.getAllByRole('button')).toHaveLength(7);
    });
});
