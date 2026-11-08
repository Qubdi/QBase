import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { ExamplesDialog } from '../examples-dialog';

describe('the examples dialog', () => {
    it('lists the examples and opens the chosen one as a new diagram', async () => {
        const onClose = vi.fn();
        const { adapter } = renderInEditor(
            <ExamplesDialog onClose={onClose} />,
            null,
            '/'
        );
        expect(
            await screen.findByRole('heading', { name: 'Examples' })
        ).toBeTruthy();
        expect(document.querySelectorAll('[data-example]').length).toBe(8);
        fireEvent.click(
            document.querySelector('[data-example="clinic"]') as HTMLElement
        );
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        const [stored] = await adapter.list();
        expect(stored.databaseType).toBe('postgresql');
        expect(stored.name).toBe('Hospital network');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('closes with Cancel and stores nothing', async () => {
        const onClose = vi.fn();
        const { adapter } = renderInEditor(
            <ExamplesDialog onClose={onClose} />,
            null,
            '/'
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect((await adapter.list()).length).toBe(0);
    });
});
