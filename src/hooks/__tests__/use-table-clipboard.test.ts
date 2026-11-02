import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databasesWithSchemas } from '@/lib/domain';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DBTable } from '@/lib/domain/db-table';
import { clearCopiedTables } from '@/lib/table-clipboard';
import {
    useTableClipboard,
    type TableClipboardOptions,
} from '../use-table-clipboard';

let os: 'mac' | 'windows' = 'windows';
vi.mock('@/lib/utils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getOperatingSystem: () => os,
}));

const table = (
    id: string,
    name: string,
    over: Partial<DBTable> = {}
): DBTable => ({
    id,
    name,
    schema: 'public',
    x: 100,
    y: 200,
    color: '#8eb7ff',
    isView: false,
    createdAt: 1,
    fields: [
        {
            id: `${id}-f`,
            name: 'id',
            type: { id: 'integer', name: 'integer' },
            primaryKey: true,
            unique: true,
            nullable: false,
            createdAt: 1,
        },
    ],
    indexes: [],
    ...over,
});

const press = (
    key: 'c' | 'v',
    mods: { ctrl?: boolean; meta?: boolean } = { ctrl: true },
    target: Element | Document = document
) =>
    fireEvent.keyDown(target, {
        key,
        code: `Key${key.toUpperCase()}`,
        ctrlKey: !!mods.ctrl,
        metaKey: !!mods.meta,
    });

const users = table('t1', 'users');
const orders = table('t2', 'orders', { x: 400, y: 200 });

const setup = (over: Partial<TableClipboardOptions> = {}) => {
    const createTable = vi.fn((table: DBTable) => Promise.resolve(void table));
    const notify = vi.fn();
    const options: TableClipboardOptions = {
        tables: [users, orders],
        selectedIds: ['t1'],
        areaIds: [],
        databaseType: DatabaseType.POSTGRESQL,
        readonly: false,
        createTable,
        notify,
        ...over,
    };
    const hook = renderHook(
        (o: TableClipboardOptions) => useTableClipboard(o),
        {
            initialProps: options,
        }
    );
    return { createTable, notify, options, ...hook };
};

const flush = () => act(async () => undefined);

describe('useTableClipboard', () => {
    beforeEach(() => {
        os = 'windows';
        clearCopiedTables();
    });
    afterEach(() => vi.restoreAllMocks());

    it('copies the selected table with Ctrl+C and pastes a copy with Ctrl+V', async () => {
        const { createTable, notify } = setup();
        press('c');
        expect(notify).toHaveBeenCalledWith('Table copied', expect.any(String));
        press('v');
        await flush();
        expect(createTable).toHaveBeenCalledTimes(1);
        const pasted = createTable.mock.calls[0][0] as DBTable;
        expect(pasted.name).toBe('users_copy');
        expect(pasted.id).not.toBe('t1');
        expect(pasted.fields[0].id).not.toBe('t1-f');
        expect(pasted.fields.map((f) => f.name)).toEqual(['id']);
        expect(notify).toHaveBeenLastCalledWith('Table pasted');
    });

    it('does not copy relationships: a paste only creates tables', async () => {
        const { createTable } = setup();
        press('c');
        press('v');
        await flush();
        // the one thing a paste may call is createTable, once per table
        expect(createTable).toHaveBeenCalledTimes(1);
    });

    it('copies several selected tables and keeps their layout', async () => {
        const { createTable, notify } = setup({ selectedIds: ['t1', 't2'] });
        press('c');
        expect(notify).toHaveBeenCalledWith(
            '2 tables copied',
            expect.any(String)
        );
        press('v');
        await flush();
        const [a, b] = createTable.mock.calls.map((c) => c[0] as DBTable);
        expect([a.name, b.name]).toEqual(['users_copy', 'orders_copy']);
        expect(b.x - a.x).toBe(300);
        expect(notify).toHaveBeenLastCalledWith('2 tables pasted');
    });

    it('ignores selected notes and areas, copying only tables', async () => {
        const { createTable } = setup({
            selectedIds: ['note-1', 'area-1', 't2'],
        });
        press('c');
        press('v');
        await flush();
        expect(createTable).toHaveBeenCalledTimes(1);
        expect((createTable.mock.calls[0][0] as DBTable).name).toBe(
            'orders_copy'
        );
    });

    it('does nothing on Ctrl+C when no table is selected', async () => {
        const { createTable, notify } = setup({ selectedIds: [] });
        press('c');
        press('v');
        await flush();
        expect(notify).not.toHaveBeenCalled();
        expect(createTable).not.toHaveBeenCalled();
    });

    it('keeps an earlier copy when Ctrl+C finds nothing selected', async () => {
        const { createTable, rerender, options } = setup();
        press('c');
        rerender({ ...options, selectedIds: [] });
        press('c');
        press('v');
        await flush();
        expect(createTable).toHaveBeenCalledTimes(1);
    });

    it('does nothing on Ctrl+V when nothing was copied', async () => {
        const { createTable } = setup();
        press('v');
        await flush();
        expect(createTable).not.toHaveBeenCalled();
    });

    it('moves each paste further so copies do not stack', async () => {
        const { createTable } = setup();
        press('c');
        press('v');
        await flush();
        press('v');
        await flush();
        const [first, second] = createTable.mock.calls.map(
            (c) => c[0] as DBTable
        );
        // one table width (224) plus the 40px gap
        expect(second.x - first.x).toBe(264);
        expect(second.y - first.y).toBe(0);
    });

    it('lets a read-only diagram copy a table but not paste one', async () => {
        const { createTable, notify, rerender, options } = setup({
            readonly: true,
        });
        press('c');
        expect(notify).toHaveBeenCalledWith('Table copied', expect.any(String));
        press('v');
        await flush();
        expect(createTable).not.toHaveBeenCalled();
        // the same copy can go into an editable diagram
        rerender({ ...options, readonly: false, tables: [orders] });
        press('v');
        await flush();
        expect(createTable).toHaveBeenCalledTimes(1);
        expect((createTable.mock.calls[0][0] as DBTable).name).toBe('users');
    });

    it('keeps the original name when pasting into a diagram that has no such table', async () => {
        const { createTable, rerender, options } = setup();
        press('c');
        rerender({ ...options, tables: [orders] });
        press('v');
        await flush();
        expect((createTable.mock.calls[0][0] as DBTable).name).toBe('users');
    });

    it('drops the schema when the database has no schemas', async () => {
        const withoutSchemas = Object.values(DatabaseType).find(
            (t) => !databasesWithSchemas.includes(t)
        )!;
        const { createTable, rerender, options } = setup();
        press('c');
        rerender({ ...options, tables: [], databaseType: withoutSchemas });
        press('v');
        await flush();
        expect(
            (createTable.mock.calls[0][0] as DBTable).schema
        ).toBeUndefined();
    });

    it('clears an area that does not exist in the diagram being pasted into', async () => {
        const inArea = table('t3', 'ledger', { parentAreaId: 'area-1' });
        const { createTable, rerender, options } = setup({
            tables: [inArea],
            selectedIds: ['t3'],
            areaIds: ['area-1'],
        });
        press('c');
        rerender({ ...options, tables: [], areaIds: [] });
        press('v');
        await flush();
        expect(
            (createTable.mock.calls[0][0] as DBTable).parentAreaId
        ).toBeNull();
    });

    describe('leaves normal copy and paste alone', () => {
        it('while text is selected on the page', async () => {
            const { notify } = setup();
            vi.spyOn(window, 'getSelection').mockReturnValue({
                toString: () => 'some selected words',
            } as Selection);
            press('c');
            expect(notify).not.toHaveBeenCalled();
        });

        it('while typing in a text box', async () => {
            const { createTable, notify } = setup();
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();
            press('c', { ctrl: true }, input);
            press('v', { ctrl: true }, input);
            await flush();
            expect(notify).not.toHaveBeenCalled();
            expect(createTable).not.toHaveBeenCalled();
            input.remove();
        });

        it('while typing in a text area', async () => {
            const { notify } = setup();
            const area = document.createElement('textarea');
            document.body.appendChild(area);
            press('c', { ctrl: true }, area);
            expect(notify).not.toHaveBeenCalled();
            area.remove();
        });
    });

    describe('on a Mac', () => {
        it('uses Cmd, not Ctrl', async () => {
            os = 'mac';
            const { createTable, notify } = setup();
            press('c', { ctrl: true });
            expect(notify).not.toHaveBeenCalled();
            press('c', { meta: true });
            expect(notify).toHaveBeenCalledWith(
                'Table copied',
                expect.any(String)
            );
            press('v', { meta: true });
            await flush();
            expect(createTable).toHaveBeenCalledTimes(1);
        });
    });

    it('uses Ctrl, not Cmd, elsewhere', () => {
        const { notify } = setup();
        press('c', { meta: true });
        expect(notify).not.toHaveBeenCalled();
    });
});
