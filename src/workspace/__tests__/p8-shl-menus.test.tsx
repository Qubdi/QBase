import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogContext } from '@/context/dialog-context/dialog-context';
import type { DialogApi } from '@/context/dialog-context/dialog-context';
import { blank } from '@/core/testing/helpers';
import { Menus } from '../navbar/menus';
import { renderInEditor } from './test-harness';

const spyDialogs = (): DialogApi =>
    new Proxy({} as DialogApi, {
        get: (target, key: string) => {
            const t = target as unknown as Record<string, unknown>;
            return (t[key] ??= vi.fn());
        },
    });

const show = (
    type: Parameters<typeof blank>[0],
    dialogs = spyDialogs(),
    commands = {}
) => {
    renderInEditor(
        <DialogContext.Provider value={dialogs}>
            <Menus commands={commands} />
        </DialogContext.Provider>,
        { design: blank(type) }
    );
    return dialogs;
};

const openMenu = async (name: string) => {
    fireEvent.keyDown(screen.getByRole('menuitem', { name }), { key: 'Enter' });
    await screen.findByRole('menu');
};
const openSub = async (name: RegExp) => {
    fireEvent.keyDown(await screen.findByRole('menuitem', { name }), {
        key: 'ArrowRight',
    });
};
const labels = (items: HTMLElement[]) => items.map((i) => i.textContent ?? '');

describe('Diagram menu (SHL-057 to SHL-060)', () => {
    it('Examples is the first item of Actions and opens the list of examples', async () => {
        const dialogs = show('postgresql');
        await openMenu('Actions');
        const items = within(await screen.findByRole('menu')).getAllByRole(
            'menuitem'
        );
        expect(items[0].textContent).toBe('Examples');
        fireEvent.click(screen.getByRole('menuitem', { name: 'Examples' }));
        expect(dialogs.openExamplesDialog).toHaveBeenCalledTimes(1);
    });

    it('SHL-057: Import offers the .json file, then SQL and DBML, both limited to their own method', async () => {
        const dialogs = show('postgresql');
        await openMenu('Actions');
        await openSub(/^Import$/);
        const items = await screen.findAllByRole('menuitem', {
            name: /^(\.json|SQL|DBML)$/,
        });
        expect(labels(items)).toEqual(['.json', 'SQL', 'DBML']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'SQL' }));
        expect(dialogs.openImportDatabaseDialog).toHaveBeenCalledWith({
            methods: ['sql'],
            initial: 'sql',
        });
    });

    it('SHL-057: DBML opens the import dialog on the DBML method; the file item opens the .json import', async () => {
        const dialogs = show('mysql');
        await openMenu('Actions');
        await openSub(/^Import$/);
        fireEvent.click(await screen.findByRole('menuitem', { name: 'DBML' }));
        expect(dialogs.openImportDatabaseDialog).toHaveBeenCalledWith({
            methods: ['dbml'],
            initial: 'dbml',
        });
    });

    it('SHL-058: Export SQL lists the own database first, then the others once each', async () => {
        const dialogs = show('mysql');
        await openMenu('Actions');
        await openSub(/^Export SQL$/);
        const items = await screen.findAllByRole('menuitem', {
            name: /^(PostgreSQL|MySQL|SQL Server|MariaDB|SQLite|Oracle|ClickHouse|CockroachDB|Generic)$/,
        });
        expect(labels(items)).toEqual([
            'MySQL',
            'PostgreSQL',
            'SQL Server',
            'MariaDB',
            'SQLite',
        ]);
        fireEvent.click(items[1]);
        expect(dialogs.openExportSqlDialog).toHaveBeenCalledWith('postgresql');
    });

    it('SHL-059: PNG and JPG open an options dialog, SVG goes at once, JSON opens the export dialog', async () => {
        const dialogs = show('postgresql');
        await openMenu('Actions');
        await openSub(/^Export as$/);
        const items = await screen.findAllByRole('menuitem', {
            name: /^(PNG|JPG|SVG|JSON)$/,
        });
        expect(labels(items)).toEqual(['PNG', 'JPG', 'SVG', 'JSON']);
        fireEvent.click(items[0]);
        expect(dialogs.openExportImageDialog).toHaveBeenCalledWith('png');
    });

    it('SHL-059: the JSON item opens the export dialog', async () => {
        const dialogs = show('postgresql');
        await openMenu('Actions');
        await openSub(/^Export as$/);
        const items = await screen.findAllByRole('menuitem', {
            name: 'JSON',
        });
        fireEvent.click(items[0]);
        expect(dialogs.openExportJsonDialog).toHaveBeenCalled();
    });

    it('SHL-060: Delete this diagram is the last item, set apart and red', async () => {
        const dialogs = show('postgresql');
        await openMenu('Actions');
        const menu = screen.getByRole('menu');
        const items = within(menu).getAllByRole('menuitem');
        const last = items[items.length - 1];
        expect(last.textContent).toBe('Delete');
        expect(last.className).toContain('text-destructive');
        fireEvent.click(last);
        expect(dialogs.openDeleteDiagramDialog).toHaveBeenCalled();
    });
});

describe('Backup menu (SHL-064)', () => {
    it('SHL-064: Export diagram and Restore diagram open the same dialogs as the JSON items', async () => {
        const dialogs = show('postgresql');
        await openMenu('Backup');
        const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
        expect(labels(items)).toEqual(['Export Diagram', 'Restore Diagram']);
        fireEvent.click(items[0]);
        expect(dialogs.openExportJsonDialog).toHaveBeenCalled();
    });

    it('SHL-064: Restore diagram opens the .json import dialog', async () => {
        const dialogs = show('postgresql');
        await openMenu('Backup');
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Restore Diagram' })
        );
        expect(dialogs.openImportDiagramDialog).toHaveBeenCalled();
    });

    it('EXP-008: an Oracle diagram offers itself first in Export SQL and can import SQL; ClickHouse cannot import SQL', async () => {
        const dialogs = show('oracle');
        await openMenu('Actions');
        await openSub(/^Export SQL$/);
        const items = await screen.findAllByRole('menuitem', {
            name: /^(PostgreSQL|MySQL|SQL Server|MariaDB|SQLite|Oracle)$/,
        });
        expect(labels(items)[0]).toBe('Oracle');
        fireEvent.click(items[0]);
        expect(dialogs.openExportSqlDialog).toHaveBeenCalledWith('oracle');
    });
});

describe('View menu (SHL-062, SHL-063)', () => {
    it('SHL-062: the toggles are plain items whose wording follows the state', async () => {
        show('postgresql');
        await openMenu('View');
        const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
        expect(labels(items)).toEqual([
            expect.stringContaining('Hide Sidebar'),
            'Hide Cardinality',
            'Hide Field Attributes',
            'Compact Tables',
            'Hide Mini Map',
            'Zoom on Scroll',
            'Database Views',
            expect.stringContaining('Theme'),
        ]);
        expect(items[0].textContent).toMatch(/Ctrl\+B|⌘B|Cmd\+B/);
    });

    it('SHL-062: compact tables and minimap are written to the browser settings', async () => {
        show('postgresql');
        await openMenu('View');
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Compact Tables' })
        );
        await waitFor(() =>
            expect(localStorage.getItem('compact_tables')).toBe('true')
        );
        await openMenu('View');
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Hide Mini Map' })
        );
        await waitFor(() =>
            expect(localStorage.getItem('show_minimap_on_canvas')).toBe('false')
        );
    });

    it('SHL-063: Zoom on Scroll is Off by default and On zooms', async () => {
        show('postgresql');
        await openMenu('View');
        await openSub(/Zoom on Scroll/);
        const radios = await screen.findAllByRole('menuitemradio');
        expect(labels(radios)).toEqual(['On', 'Off']);
        expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
            'false',
            'true',
        ]);
        fireEvent.click(radios[0]);
        await waitFor(() =>
            expect(localStorage.getItem('scroll_action')).toBe('zoom')
        );
    });

    it('SHL-063: Database Views are On or Off, off by default', async () => {
        show('postgresql');
        await openMenu('View');
        await openSub(/Database Views/);
        const radios = await screen.findAllByRole('menuitemradio');
        expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
            'false',
            'true',
        ]);
        fireEvent.click(radios[0]);
        await waitFor(() =>
            expect(localStorage.getItem('show_db_views')).toBe('true')
        );
    });

    it('SHL-063: the Theme item shows the Ctrl/Cmd+M key and offers System, Light, Dark', async () => {
        show('postgresql');
        await openMenu('View');
        const theme = await screen.findByRole('menuitem', { name: /Theme/ });
        expect(theme.textContent).toMatch(/Ctrl\+M|⌘M|Cmd\+M/);
        await openSub(/Theme/);
        const radios = await screen.findAllByRole('menuitemradio');
        expect(labels(radios)).toEqual(['System', 'Light', 'Dark']);
    });
});

describe('SVG goes out at once (SHL-059)', () => {
    it('uses fixed options: transparent, no dotted background, scale 1', async () => {
        const { SVG_QUICK_OPTIONS } =
            await import('@/features/export/run-image-export');
        expect(SVG_QUICK_OPTIONS).toEqual({
            scale: 1,
            pattern: false,
            transparent: true,
        });
    });
});
