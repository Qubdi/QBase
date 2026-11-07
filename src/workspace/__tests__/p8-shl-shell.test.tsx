import React from 'react';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { blank } from '@/core/testing/helpers';
import { i18n } from '@/i18n/i18n';
import { EditorFrame } from '../editor-frame';
import { renderInEditor } from './test-harness';

beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(() => vi.unstubAllGlobals());

const phone = () =>
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: !query.includes('min-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        onchange: null,
        dispatchEvent: () => false,
    }));

const frame = (type: Parameters<typeof blank>[0] = 'postgresql') =>
    renderInEditor(
        <HelmetProvider>
            <EditorFrame />
        </HelmetProvider>,
        { design: blank(type) }
    );

const order = (a: Node, b: Node) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('desktop navbar (SHL-055, SHL-056)', () => {
    it('SHL-055: logo to /, the menubar, the diagram name in the middle, the right controls', () => {
        const { container } = frame();
        const header = container.querySelector('header')!;
        expect(header.className).toContain('h-12');
        const logo = within(header).getByRole('link', { name: 'QBase home' });
        expect(logo.getAttribute('href')).toBe('/');
        const menubar = within(header).getByRole('menubar');
        const name = within(header).getByTestId('diagram-name');
        const right = header.querySelector('[data-slot="navbar-right"]')!;
        expect(order(logo, menubar)).toBe(true);
        expect(order(menubar, name)).toBe(true);
        expect(order(name, right)).toBe(true);
    });

    it('SHL-055: the save, publish and account controls are hidden under 640 px, the language button is not', () => {
        const { container } = frame();
        const right = container.querySelector('[data-slot="navbar-right"]')!;
        const hidden = right.querySelector('.hidden.sm\\:flex')!;
        expect(hidden).toBeTruthy();
        expect(hidden.querySelector('[role="img"]')).toBeTruthy();
        const language = within(right as HTMLElement).getByRole('button', {
            name: 'Change language',
        });
        expect(hidden.contains(language)).toBe(false);
    });

    it('SHL-056: without a server: save status, lint and the language button, in that order; no account, drift or publish', () => {
        const { container } = frame();
        const right = container.querySelector('[data-slot="navbar-right"]')!;
        const save = right.querySelector('[role="img"]')!;
        const language = within(right as HTMLElement).getByRole('button', {
            name: 'Change language',
        });
        const lint = within(right as HTMLElement).getByRole('button', {
            name: 'Lint',
        });
        expect(order(save, lint)).toBe(true);
        expect(order(lint, language)).toBe(true);
        for (const name of [/sign in/i, /publish/i, /drift/i, /get latest/i])
            expect(
                within(right as HTMLElement).queryByRole('button', { name })
            ).toBeNull();
    });
});

describe('phone layout (SHL-068, SHL-070, SHL-071, SHL-072)', () => {
    it('SHL-068: the bar reads QBase, language, then the menus, then the name; the rail is an overlay', () => {
        phone();
        const { container } = frame();
        const header = container.querySelector('header')!;
        const brand = within(header).getByTestId('brand');
        const language = within(header).getByRole('button', {
            name: 'Change language',
        });
        const menubar = within(header).getByRole('menubar');
        const name = within(header).getByTestId('diagram-name');
        expect(order(brand, language)).toBe(true);
        expect(order(language, menubar)).toBe(true);
        expect(order(menubar, name)).toBe(true);
        fireEvent.click(
            screen.getByRole('button', { name: 'Show the tool strip' })
        );
        const rail = screen.getByRole('navigation', {
            name: 'Editor sections',
        });
        expect(rail.parentElement!.className).toContain('absolute');
    });

    it('SHL-072: the editor fills dynamic viewport units on a phone and screen units on a desktop', () => {
        phone();
        const phoneView = frame();
        expect(phoneView.container.querySelector('.h-dvh.w-dvw')).toBeTruthy();
        phoneView.unmount();
        vi.unstubAllGlobals();
        const desktop = frame();
        expect(
            desktop.container.querySelector('.h-screen.w-screen')
        ).toBeTruthy();
        expect(desktop.container.querySelector('.h-dvh')).toBeNull();
    });

    const openDrawer = async (
        type: Parameters<typeof blank>[0] = 'postgresql'
    ) => {
        phone();
        const view = frame(type);
        fireEvent.click(
            screen.getByRole('button', { name: 'Open the editing panel' })
        );
        const dialog = await screen.findByRole('dialog');
        return { ...view, dialog };
    };

    it('SHL-070: the panel is a drawer with a title, a description and a section dropdown; it starts hidden', async () => {
        phone();
        const { store } = frame();
        expect(store.getState().ui.panel.open).toBe(false);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open the editing panel' })
        );
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText(i18n.t('editor.workspace.drawer.title'))
        ).toBeTruthy();
        expect(
            within(dialog).getByText(
                i18n.t('editor.workspace.drawer.description')
            )
        ).toBeTruthy();
        expect(
            within(dialog).getByRole('combobox', { name: 'Section' })
        ).toBeTruthy();
    });

    it('SHL-071: the dropdown lists DBML and keeps Areas and Notes apart from Custom types', async () => {
        const { dialog, store } = await openDrawer('postgresql');
        fireEvent.keyDown(
            within(dialog).getByRole('combobox', { name: 'Section' }),
            { key: ' ' }
        );
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).toEqual([
            'Tables',
            'DBML',
            'Links',
            'Custom types',
            'Areas',
            'Notes',
        ]);
        fireEvent.click(screen.getByRole('option', { name: 'Areas' }));
        await waitFor(() =>
            expect(store.getState().ui.panel).toMatchObject({
                section: 'visuals',
                visualsTab: 'areas',
            })
        );
        expect(store.getState().ui.panel.section).not.toBe('customTypes');
    });

    it('SHL-071: Custom types is offered only where the database has them', async () => {
        const { dialog } = await openDrawer('mysql');
        fireEvent.keyDown(
            within(dialog).getByRole('combobox', { name: 'Section' }),
            { key: ' ' }
        );
        const options = (await screen.findAllByRole('option')).map(
            (o) => o.textContent
        );
        expect(options).not.toContain('Custom types');
        expect(options).toContain('DBML');
    });
});

describe('icon rail (SHL-074 to SHL-076)', () => {
    it('SHL-074: New and Browse on top, a separator, then Tables, DBML, Links, Types, Extras', () => {
        frame('postgresql');
        const rail = screen.getByRole('navigation', {
            name: 'Editor sections',
        });
        const buttons = within(rail)
            .getAllByRole('button')
            .map((b) => b.textContent);
        expect(buttons).toEqual([
            'New',
            'Open',
            'Tables',
            'DBML',
            'Links',
            'Types',
            'Extras',
        ]);
        const sep = rail.querySelector('hr')!;
        const [, browse, tables] = within(rail).getAllByRole('button');
        expect(order(browse, sep)).toBe(true);
        expect(order(sep, tables)).toBe(true);
    });

    it('SHL-074: the active section is tinted', () => {
        const { store } = frame('postgresql');
        const tables = screen.getByRole('button', { name: 'Tables' });
        expect(tables.className).toContain('text-primary');
        expect(
            screen.getByRole('button', { name: 'Links' }).className
        ).not.toContain('text-primary');
        act(() => store.getState().showPanel('refs'));
        expect(
            screen.getByRole('button', { name: 'Links' }).className
        ).toContain('text-primary');
        expect(
            screen.getByRole('button', { name: 'Tables' }).className
        ).not.toContain('text-primary');
    });

    it('SHL-075: the Custom types entry is there for PostgreSQL only', () => {
        const pg = frame('postgresql');
        expect(screen.queryByRole('button', { name: 'Types' })).toBeTruthy();
        pg.unmount();
        for (const type of [
            'mysql',
            'sqlite',
            'sql_server',
            'mariadb',
        ] as const) {
            const view = frame(type);
            expect(
                screen.queryByRole('button', { name: 'Types' }),
                type
            ).toBeNull();
            view.unmount();
        }
    });

    it('SHL-076: Extras opens on the Areas tab, and the rail has no links to other sites', () => {
        const { store } = frame();
        store.getState().showPanel('visuals', 'notes');
        fireEvent.click(screen.getByRole('button', { name: 'Extras' }));
        expect(store.getState().ui.panel.visualsTab).toBe('areas');
        const rail = screen.getByRole('navigation', {
            name: 'Editor sections',
        });
        expect(rail.querySelectorAll('a')).toHaveLength(0);
    });
});

describe('side panel (SHL-077)', () => {
    it('opens at a quarter of the width, never under 350 px, and animates its width in 200 ms', () => {
        const { container } = frame();
        const panel = container.querySelector('[data-slot="side-panel"]')!
            .parentElement!.parentElement!;
        expect(panel.className).toContain('duration-200');
        expect(panel.className).toContain('transition-[width]');
        expect(parseInt(panel.style.width, 10)).toBeGreaterThanOrEqual(350);
    });

    it('hides to zero width, with no drag handle, when closed', () => {
        const { container, store } = frame();
        expect(screen.getByRole('slider', { name: /resize/i })).toBeTruthy();
        act(() => store.getState().hidePanel());
        const panel = container.querySelector('[data-slot="side-panel"]')!
            .parentElement!.parentElement!;
        expect(panel.style.width).toBe('0px');
        expect(screen.queryByRole('slider')).toBeNull();
    });

    it('the handle resizes with the keyboard and keeps the width within the limits', () => {
        // happy-dom has no layout: give the frame a width to work with
        const width = vi
            .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
            .mockReturnValue(1500);
        const { container } = frame();
        const handle = screen.getByRole('slider');
        const before = Number(handle.getAttribute('aria-valuenow'));
        fireEvent.keyDown(handle, { key: 'ArrowRight' });
        const panel = container.querySelector('[data-slot="side-panel"]')!
            .parentElement!.parentElement!;
        expect(parseInt(panel.style.width, 10)).toBe(before + 20);
        for (let i = 0; i < 40; i++)
            fireEvent.keyDown(handle, { key: 'ArrowLeft' });
        expect(parseInt(panel.style.width, 10)).toBe(350);
        expect(handle.getAttribute('aria-valuemin')).toBe('350');
        expect(handle.getAttribute('aria-valuemax')).toBe('1485');
        width.mockRestore();
    });
});
