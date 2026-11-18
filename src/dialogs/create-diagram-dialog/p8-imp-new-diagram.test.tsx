import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderInEditor } from '@/workspace/__tests__/test-harness';
import { CreateDiagramDialog } from './create-diagram-dialog';

describe('IMP-004 step 1 of the new diagram dialog', () => {
    it('SHL-032: shows two rows of three cards, PostgreSQL is the chosen type', async () => {
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
            radios.map((r) => r.getAttribute('aria-checked') === 'true')
        ).toEqual([false, true, false, false, false, false]);
        expect(screen.queryAllByRole('tab')).toEqual([]);
    });
    it('SHL-032: a card makes a diagram of its database, and Back keeps the card chosen', async () => {
        const { adapter } = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(await screen.findByRole('radio', { name: /Oracle/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
        expect(
            (await screen.findByRole('radio', { name: /Oracle/ })).getAttribute(
                'aria-checked'
            )
        ).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Empty database' }));
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        expect((await adapter.list())[0].databaseType).toBe('oracle');
    });
    it('CLI-135: one card is a Tab stop, and arrow keys move focus between cards without picking', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const radios = await screen.findAllByRole('radio');
        expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1]);
        radios[1].focus();
        fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(radios[2]);
        expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
        fireEvent.keyDown(radios[2], { key: 'ArrowLeft' });
        fireEvent.keyDown(radios[1], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(radios[0]);
        fireEvent.keyDown(radios[0], { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(radios[5]);
        expect(screen.getAllByRole('radio').length).toBe(6);
    });
    it('the cards carry the logo of their database', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        const radios = await screen.findAllByRole('radio');
        for (const r of radios) {
            expect(r.querySelector('img')).not.toBeNull();
            expect(r.querySelector('svg')).toBeNull();
            // the logo carries the name, which stays for a screen reader
            expect((r.textContent ?? '').length).toBeGreaterThan(0);
        }
    });
    it('"Empty database" makes a PostgreSQL diagram without choosing a type', async () => {
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
        expect((await adapter.list())[0].databaseType).toBe('postgresql');
    });
    it('step 2 shows the three methods and Back returns to step 1', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(await screen.findByRole('radio', { name: /MariaDB/ }));
        expect(
            (await screen.findAllByRole('radio')).map((t) => t.textContent)
        ).toEqual(['Smart Query', 'SQL Script', 'DBML']);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect((await screen.findAllByRole('radio')).length).toBe(6);
    });
});

describe('the examples step of the new diagram dialog', () => {
    it('lists one example for each database and Back returns to the databases', async () => {
        renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Check Examples' })
        );
        expect(
            await screen.findByRole('heading', { name: 'Examples' })
        ).toBeTruthy();
        const cards = document.querySelectorAll('[data-example]');
        expect(cards.length).toBe(6);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect((await screen.findAllByRole('radio')).length).toBe(6);
    });

    it('opens the chosen example as a new diagram of that database', async () => {
        const { adapter } = renderInEditor(
            <CreateDiagramDialog dialog={{ open: true }} />,
            null,
            '/'
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Check Examples' })
        );
        await screen.findByRole('heading', { name: 'Examples' });
        fireEvent.click(
            document.querySelector('[data-example="bookshop"]') as HTMLElement
        );
        await waitFor(async () =>
            expect((await adapter.list()).length).toBe(1)
        );
        const [stored] = await adapter.list();
        expect(stored.databaseType).toBe('mysql');
        expect(stored.name).toBe('Online bookshop');
    });
});
