import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { CreateDiagramDialog } from './create-diagram-dialog';

describe('IMP-004 step 1 of the new diagram dialog', () => {
    it('offers the seven kept databases, Generic chosen first', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const radios = await screen.findAllByRole('radio');
        expect(radios.map((r) => r.textContent)).toEqual([
            'Generic',
            'PostgreSQL',
            'MySQL',
            'SQL Server',
            'MariaDB',
            'SQLite',
            'CockroachDB',
        ]);
        expect(radios[0].getAttribute('aria-checked')).toBe('true');
        expect(
            radios
                .slice(1)
                .every((r) => r.getAttribute('aria-checked') === 'false')
        ).toBe(true);
    });
    it('"Blank diagram instead" makes a Generic diagram without choosing a type', async () => {
        const { adapter } = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Blank diagram' })
        );
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        expect((await adapter.list())[0].databaseType).toBe('generic');
    });
    it('step 2 shows the three methods and Back returns to step 1', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Continue' })
        );
        expect(
            (await screen.findAllByRole('tab')).map((t) => t.textContent)
        ).toEqual(['Database query', 'SQL script', 'DBML']);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect((await screen.findAllByRole('radio')).length).toBe(7);
    });
});
