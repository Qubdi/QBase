import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { CreateDiagramDialog } from './create-diagram-dialog';

describe('IMP-004 step 1 of the new diagram dialog', () => {
    it('SHL-032: Transactional tab shows two rows of three cards, Generic stays the chosen type', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const radios = await screen.findAllByRole('radio');
        expect(radios.map((r) => r.textContent)).toEqual([
            'MySQL',
            'PostgreSQL',
            'MariaDB',
            'SQLite',
            'SQL Server',
            'Oracle',
        ]);
        expect(
            radios.every((r) => r.getAttribute('aria-checked') === 'false')
        ).toBe(true);
        expect(
            screen
                .getByRole('button', { name: 'Use a generic database instead' })
                .getAttribute('aria-pressed')
        ).toBe('true');
        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
            'Transactional',
            'Analytical',
        ]);
    });
    it('SHL-032 SHL-042: the toggle moves the window one row down and back', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'More Databases' })
        );
        expect(
            (await screen.findAllByRole('radio')).map((r) => r.textContent)
        ).toEqual(['SQLite', 'SQL Server', 'Oracle', 'CockroachDB']);
        fireEvent.click(
            screen.getByRole('button', { name: 'Primary Databases' })
        );
        expect((await screen.findAllByRole('radio'))[0].textContent).toBe(
            'MySQL'
        );
    });
    it('SHL-032: the Analytical tab holds ClickHouse, and a card makes a ClickHouse diagram', async () => {
        const { adapter } = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.mouseDown(
            await screen.findByRole('tab', { name: 'Analytical' }),
            {
                button: 0,
            }
        );
        const card = await screen.findByRole('radio', { name: /ClickHouse/ });
        fireEvent.click(card);
        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
        expect(
            (
                await screen.findByRole('radio', { name: /ClickHouse/ })
            ).getAttribute('aria-checked')
        ).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Empty database' }));
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        expect((await adapter.list())[0].databaseType).toBe('clickhouse');
    });
    it('the cards carry the neutral database icon, no logo', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const radios = await screen.findAllByRole('radio');
        for (const r of radios) {
            expect(r.querySelector('svg')).not.toBeNull();
            expect(r.querySelector('img')).toBeNull();
        }
    });
    it('"Blank diagram instead" makes a Generic diagram without choosing a type', async () => {
        const { adapter } = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Empty database' })
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
            (await screen.findAllByRole('radio')).map((t) => t.textContent)
        ).toEqual(['Smart Query', 'SQL Script', 'DBML']);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect((await screen.findAllByRole('radio')).length).toBe(6);
    });
});
