import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ViewerTableNode } from '../viewer-table-node';

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    Position: { Left: 'left', Right: 'right' },
}));

describe('the viewer table node', () => {
    it('names the primary-key icon, so the meaning is not icon-only', () => {
        const table = {
            id: 't1',
            name: 'orders',
            isView: false,
            fields: [
                { id: 'f1', name: 'id', type: 'int', primaryKey: true },
                { id: 'f2', name: 'note', type: 'text', primaryKey: false },
            ],
        };
        render(
            <ViewerTableNode
                {...({
                    data: {
                        table,
                        dimmed: false,
                        selected: false,
                        matched: false,
                    },
                } as unknown as React.ComponentProps<typeof ViewerTableNode>)}
            />
        );
        expect(
            screen.getAllByRole('img', { name: 'Primary key' })
        ).toHaveLength(1);
    });
});
