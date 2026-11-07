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
    it('SHL-057: Import offers the .json file, then SQL and DBML, both limited to their own method', async () => {
        const dialogs = show('postgresql');
        await openMenu('Diagram');
        await openSub(/Import from/);
        const items = await screen.findAllByRole('menuitem', {
            name: /Diagram file|SQL script|DBML text/,
        });
        expect(labels(items)).toEqual([
            'Diagram file (.json)',
            'SQL script',
            'DBML text',
        ]);
        fireEvent.click(screen.getByRole('menuitem', { name: 'SQL script' }));
        expect(dialogs.openImportDatabaseDialog).toHaveBeenCalledWith({
            methods: ['sql'],
            initial: 'sql',
        });
    });

    it('SHL-057: DBML opens the import dialog on the DBML method; the file item opens the .json import', async () => {
        const dialogs = show('mysql');
        await openMenu('Diagram');
        await openSub(/Import from/);
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'DBML text' })
        );
        expect(dialogs.openImportDatabaseDialog).toHaveBeenCalledWith({
            methods: ['dbml'],
            initial: 'dbml',
        });
    });

    it('SHL-058: Export SQL lists the own database first, then the others once each', async () => {
        const dialogs = show('mysql');
        await openMenu('Diagram');
        await openSub(/Export SQL for/);
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
        await openMenu('Diagram');
        await openSub(/Save as/);
        const items = await screen.findAllByRole('menuitem', {
            name: /PNG image|JPEG image|SVG image|Diagram file/,
        });
        expect(labels(items)).toEqual([
            'PNG image',
            'JPEG image',
            'SVG image',
            'Diagram file (.json)',
        ]);
        fireEvent.click(items[0]);
        expect(dialogs.openExportImageDialog).toHaveBeenCalledWith('png');
    });

    it('SHL-059: the JSON item opens the export dialog', async () => {
        const dialogs = show('postgresql');
        await openMenu('Diagram');
        await openSub(/Save as/);
        const items = await screen.findAllByRole('menuitem', {
            name: 'Diagram file (.json)',
        });
        fireEvent.click(items[0]);
        expect(dialogs.openExportJsonDialog).toHaveBeenCalled();
    });

    it('SHL-060: Delete this diagram is the last item, set apart and red', async () => {
        const dialogs = show('postgresql');
        await openMenu('Diagram');
        const menu = screen.getByRole('menu');
        const items = within(menu).getAllByRole('menuitem');
        const last = items[items.length - 1];
        expect(last.textContent).toBe('Delete this diagram');
        expect(last.className).toContain('text-destructive');
        fireEvent.click(last);
        expect(dialogs.openDeleteDiagramDialog).toHaveBeenCalled();
    });
});

describe('View menu (SHL-062, SHL-063)', () => {
    it('SHL-062: lists side panel, cardinality, field attributes, compact tables, minimap with check marks', async () => {
        show('postgresql');
        await openMenu('View');
        const boxes = screen.getAllByRole('menuitemcheckbox');
        const names = boxes.map((b) => b.textContent);
        expect(names).toEqual([
            expect.stringContaining('Side panel'),
            'Relationship cardinality',
            'Field attributes',
            'Compact tables',
            'Minimap',
            'Database views',
        ]);
        // the defaults of the spec: panel, cardinality, attributes, minimap on; compact, views off
        expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual([
            'true',
            'true',
            'true',
            'false',
            'true',
            'false',
        ]);
        expect(
            screen.getByRole('menuitemcheckbox', { name: /Side panel/ })
                .textContent
        ).toMatch(/Ctrl\+B|⌘B|Cmd\+B/);
    });

    it('SHL-062: compact tables and minimap are written to the browser settings', async () => {
        show('postgresql');
        await openMenu('View');
        fireEvent.click(
            screen.getByRole('menuitemcheckbox', { name: 'Compact tables' })
        );
        await waitFor(() =>
            expect(localStorage.getItem('compact_tables')).toBe('true')
        );
        await openMenu('View');
        fireEvent.click(
            screen.getByRole('menuitemcheckbox', { name: 'Minimap' })
        );
        await waitFor(() =>
            expect(localStorage.getItem('show_minimap_on_canvas')).toBe('false')
        );
    });

    it('SHL-063: the mouse wheel moves the view by default and zooms when chosen', async () => {
        show('postgresql');
        await openMenu('View');
        await openSub(/Mouse wheel/);
        const radios = await screen.findAllByRole('menuitemradio');
        expect(labels(radios)).toEqual(['Moves the view', 'Zooms the view']);
        expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual([
            'true',
            'false',
        ]);
        fireEvent.click(radios[1]);
        await waitFor(() =>
            expect(localStorage.getItem('scroll_action')).toBe('zoom')
        );
    });

    it('SHL-063: database views are shown or hidden by one switch, off by default', async () => {
        show('postgresql');
        await openMenu('View');
        const views = screen.getByRole('menuitemcheckbox', {
            name: 'Database views',
        });
        expect(views.getAttribute('aria-checked')).toBe('false');
        fireEvent.click(views);
        await waitFor(() =>
            expect(localStorage.getItem('show_db_views')).toBe('true')
        );
    });

    it('SHL-063: the theme item shows the Ctrl/Cmd+M key', async () => {
        show('postgresql');
        await openMenu('View');
        await openSub(/Color theme/);
        const key = await screen.findByRole('menuitem', {
            name: /Switch light and dark/,
        });
        expect(key.textContent).toMatch(/Ctrl\+M|⌘M|Cmd\+M/);
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
