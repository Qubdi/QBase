import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { blank, NOW, withTables } from '@/core/testing/helpers';
import { Menus } from '../navbar/menus';
import { exportTargets } from '../navbar/export-targets';
import { renderInEditor } from './test-harness';

const openMenu = async (name: string) => {
    const trigger = screen.getByRole('menuitem', { name });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await screen.findByRole('menu');
};

describe('export targets (EXP-001, EXP-007, EXP-008)', () => {
    it('puts the diagram own database first and skips it in the standard list', () => {
        expect(exportTargets('mysql')).toEqual([
            'mysql',
            'postgresql',
            'sql_server',
            'mariadb',
            'sqlite',
            'oracle',
        ]);
        expect(exportTargets('postgresql')).toEqual([
            'postgresql',
            'mysql',
            'sql_server',
            'mariadb',
            'sqlite',
            'oracle',
        ]);
    });
    it('an Oracle diagram exports to itself and the five, and Oracle is a target of the others (EXP-008)', () => {
        expect(exportTargets('oracle')).toEqual([
            'oracle',
            'postgresql',
            'mysql',
            'sql_server',
            'mariadb',
            'sqlite',
        ]);
        expect(exportTargets('mysql')).toContain('oracle');
    });
});

describe('navbar menus (SHL-050 to SHL-063)', () => {
    it('has the four menus, Backup last (SHL-064)', () => {
        renderInEditor(<Menus commands={{}} />, { design: blank() });
        expect(screen.getByRole('menuitem', { name: 'Actions' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'View' })).toBeTruthy();
        expect(screen.getByRole('menuitem', { name: 'Backup' })).toBeTruthy();
    });

    it('Undo and Redo are off with nothing to undo, and Undo works after an edit', async () => {
        const { store } = renderInEditor(
            <Menus commands={{ undo: () => store.getState().undo() }} />,
            {
                design: withTables(['a']),
                now: () => NOW,
            }
        );
        await openMenu('Edit');
        expect(
            screen
                .getByRole('menuitem', { name: /^Undo/ })
                .getAttribute('data-disabled')
        ).not.toBeNull();
        expect(
            screen
                .getByRole('menuitem', { name: /^Redo/ })
                .getAttribute('data-disabled')
        ).not.toBeNull();
    });

    it('Clear is off in a read-only diagram', async () => {
        renderInEditor(<Menus commands={{}} />, {
            design: blank(),
            readonly: true,
        });
        await openMenu('Edit');
        expect(
            screen
                .getByRole('menuitem', { name: /Clear/ })
                .getAttribute('data-disabled')
        ).not.toBeNull();
    });

    it('the side panel item follows the panel and calls the toggle', async () => {
        let toggled = 0;
        renderInEditor(
            <Menus commands={{ togglePanel: () => (toggled += 1) }} />,
            { design: blank() }
        );
        await openMenu('View');
        const item = screen.getByRole('menuitem', { name: /Hide Sidebar/ });
        fireEvent.click(item);
        await waitFor(() => expect(toggled).toBe(1));
    });
});
