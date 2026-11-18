import React from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metadataScriptFor } from '../metadata-scripts';
import { dumpCommandFor, PSQL_COMMAND } from '../import-instructions';
import { ImportBox } from '../import-box';
import type { ImportBoxProps, ImportBoxState } from '../import-box';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/platform/toast/use-toast', () => ({ toast }));

let last: ImportBoxState | undefined;
const onChange = (s: ImportBoxState) => {
    last = s;
};

const show = (props: Partial<ImportBoxProps> = {}) =>
    render(
        <ImportBox databaseType="postgresql" onChange={onChange} {...props} />
    );

// the paste box is the one writable textarea
const area = () =>
    screen
        .getAllByRole('textbox')
        .find(
            (e) =>
                e.tagName === 'TEXTAREA' && !(e as HTMLTextAreaElement).readOnly
        ) as HTMLTextAreaElement;
const paste = (text: string) =>
    fireEvent.paste(area(), { clipboardData: { getData: () => text } });
const radio = (name: string) => screen.getByRole('radio', { name });

const writeText = vi.fn();
const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const realMatchMedia = window.matchMedia;
beforeEach(() => {
    last = undefined;
    toast.mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
    });
});
afterEach(() => {
    if (realClipboard)
        Object.defineProperty(navigator, 'clipboard', realClipboard);
    window.matchMedia = realMatchMedia;
});

describe('ImportBox editions', () => {
    it('offers Regular and the editions of PostgreSQL, Regular first', () => {
        show();
        const group = screen.getByRole('radiogroup', {
            name: 'Database Edition:',
        });
        expect(
            within(group)
                .getAllByRole('radio')
                .map((r) => r.textContent)
        ).toEqual(['Regular', 'Supabase', 'Timescale']);
        expect(radio('Regular')).toHaveAttribute('aria-checked', 'true');
        expect(last?.edition).toBeUndefined();
    });

    it('picking an edition reports it and shows its own query; Regular goes back', async () => {
        show();
        await userEvent.click(radio('Supabase'));
        expect(radio('Supabase')).toHaveAttribute('aria-checked', 'true');
        expect(last?.edition).toBe('supabase');
        await userEvent.click(
            screen.getByRole('button', { name: 'Copy the query' })
        );
        expect(writeText).toHaveBeenCalledWith(
            metadataScriptFor('postgresql', 'supabase')
        );
        await userEvent.click(radio('Regular'));
        expect(last?.edition).toBeUndefined();
    });

    it('has no edition choice for a database without editions', () => {
        show({ databaseType: 'mariadb' });
        expect(
            screen.queryByRole('radiogroup', { name: 'Database Edition:' })
        ).toBeNull();
    });
});

describe('ImportBox instructions', () => {
    it('copies the query and says so', async () => {
        show();
        await userEvent.click(
            screen.getByRole('button', { name: 'Copy the query' })
        );
        expect(writeText).toHaveBeenCalledWith(metadataScriptFor('postgresql'));
        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'Query copied' })
        );
    });

    it('does not say "copied" when the clipboard refuses', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        show();
        await userEvent.click(
            screen.getByRole('button', { name: 'Copy the query' })
        );
        await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive' })
        );
        expect(toast).not.toHaveBeenCalledWith({ title: 'Query copied' });
    });

    it('PostgreSQL can run the query through psql instead of a client', async () => {
        show();
        const psql = screen.getByRole('tab', { name: 'PSQL' });
        expect(screen.getByRole('tab', { name: 'DB Client' })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        await userEvent.click(psql);
        expect(psql).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByText('Save the script as a file, then run:')
        ).toBeInTheDocument();
        expect(
            screen.getByRole('textbox', { name: 'PSQL' }).textContent
        ).toContain(PSQL_COMMAND.split('\n')[0]);
        // the psql command has nothing to copy to
        expect(
            screen.queryByRole('button', { name: 'Copy the query' })
        ).toBeNull();
    });

    it('MySQL has no psql choice', () => {
        show({ databaseType: 'mysql' });
        expect(screen.queryByRole('tab', { name: 'PSQL' })).toBeNull();
    });

    it('the SQL tab shows the dump command and its example, each one copied on its own', async () => {
        show();
        await userEvent.click(radio('SQL Script'));
        const dump = dumpCommandFor('postgresql')!;
        expect(screen.getByText('1. Install pg_dump.')).toBeInTheDocument();
        const copies = screen.getAllByRole('button', {
            name: 'Copy the query',
        });
        expect(copies).toHaveLength(2);
        await userEvent.click(copies[0]);
        expect(writeText).toHaveBeenLastCalledWith(dump.template);
        await userEvent.click(copies[1]);
        expect(writeText).toHaveBeenLastCalledWith(dump.example);
        await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    });

    it('the SQL tab has no dump command for SQL Server', async () => {
        show({ databaseType: 'sql_server' });
        await userEvent.click(radio('SQL Script'));
        expect(screen.queryByText(/^1\. Install/)).toBeNull();
        expect(
            screen.getByRole('textbox', { name: 'SQL script' })
        ).toBeInTheDocument();
    });
});

describe('ImportBox methods', () => {
    it('starts on the method it was asked for', () => {
        show({ initialMethod: 'dbml' });
        expect(radio('DBML')).toHaveAttribute('aria-checked', 'true');
        expect(last?.method).toBe('dbml');
    });

    it('ignores an asked method that is not allowed and starts on the first allowed one', () => {
        show({ methods: ['sql', 'dbml'], initialMethod: 'metadata' });
        expect(last?.method).toBe('sql');
        expect(screen.queryByRole('radio', { name: 'Smart Query' })).toBeNull();
    });

    it('a paste does not switch to a method that is not allowed', () => {
        show({ methods: ['dbml'] });
        paste('CREATE TABLE a (id int);');
        expect(last?.method).toBe('dbml');
        expect(area().value).toBe('CREATE TABLE a (id int);');
    });

    it('an empty paste is left to the browser', () => {
        show();
        const event = fireEvent.paste(area(), {
            clipboardData: { getData: () => '' },
        });
        // not handled: the default was not prevented
        expect(event).toBe(true);
        expect(area().value).toBe('');
    });

    it('a paste replaces the selected text', () => {
        show({ initialMethod: 'dbml' });
        fireEvent.change(area(), { target: { value: 'Table a {}\nOLD' } });
        area().setSelectionRange(11, 14);
        paste('Table b {}');
        expect(area().value).toBe('Table a {}\nTable b {}');
    });

    it('counts the lines of the text in the gutter, and the gutter follows the scroll', () => {
        show({ initialMethod: 'dbml' });
        fireEvent.change(area(), { target: { value: 'a\nb\nc' } });
        // the line numbers sit just before the paste box
        const gutter = area().previousElementSibling as HTMLElement;
        expect(gutter.textContent).toBe('123');
        area().scrollTop = 40;
        fireEvent.scroll(area());
        expect(gutter.style.transform).toBe('translateY(-40px)');
    });
});

describe('ImportBox panel width', () => {
    const slider = () =>
        screen.getByRole('slider', { name: 'Resize the instructions panel' });

    it('arrow keys widen and narrow the instructions, within limits', () => {
        show();
        expect(slider()).toHaveAttribute('aria-valuenow', '350');
        fireEvent.keyDown(slider(), { key: 'ArrowRight' });
        expect(slider()).toHaveAttribute('aria-valuenow', '370');
        fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
        fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
        expect(slider()).toHaveAttribute('aria-valuenow', '330');
        for (let i = 0; i < 20; i++)
            fireEvent.keyDown(slider(), { key: 'ArrowLeft' });
        expect(slider()).toHaveAttribute('aria-valuenow', '260');
        for (let i = 0; i < 30; i++)
            fireEvent.keyDown(slider(), { key: 'ArrowRight' });
        expect(slider()).toHaveAttribute('aria-valuenow', '560');
        fireEvent.keyDown(slider(), { key: 'Enter' });
        expect(slider()).toHaveAttribute('aria-valuenow', '560');
    });

    it('can be dragged, and stops following the pointer once it is let go', () => {
        show();
        const handle = slider();
        handle.setPointerCapture = vi.fn();
        // a move before any press does nothing
        fireEvent.pointerMove(handle, { clientX: 500 });
        expect(handle).toHaveAttribute('aria-valuenow', '350');
        fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
        expect(handle.setPointerCapture).toHaveBeenCalled();
        fireEvent.pointerMove(handle, { clientX: 160 });
        expect(handle).toHaveAttribute('aria-valuenow', '410');
        fireEvent.pointerMove(handle, { clientX: 1000 });
        expect(handle).toHaveAttribute('aria-valuenow', '560');
        fireEvent.pointerUp(handle);
        fireEvent.pointerMove(handle, { clientX: 0 });
        expect(handle).toHaveAttribute('aria-valuenow', '560');
    });

    it('stacks the two parts on a narrow screen, and splits them once it grows', () => {
        let listener: (() => void) | undefined;
        const query = {
            matches: false,
            addEventListener: (_: string, fn: () => void) => (listener = fn),
            removeEventListener: vi.fn(),
        };
        window.matchMedia = vi.fn(() => query) as never;
        const view = show();
        expect(screen.queryByRole('slider')).toBeNull();
        query.matches = true;
        act(() => listener!());
        expect(slider()).toBeInTheDocument();
        view.unmount();
        expect(query.removeEventListener).toHaveBeenCalled();
    });
});
