import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseType, type DBTable } from '@/qbase/diagram-types';
import { clearCopiedTables } from '@/lib/table-clipboard';
import { useTableClipboard } from '../use-table-clipboard';

let os: 'mac' | 'windows' = 'windows';
vi.mock('@/lib/utils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getOperatingSystem: () => os,
}));

const users = {
    id: 't1',
    name: 'users',
    x: 0,
    y: 0,
    color: '#fff',
    isView: false,
    createdAt: 1,
    fields: [],
    indexes: [],
} as DBTable;

const copyOnce = () => {
    const notify = vi.fn();
    renderHook(() =>
        useTableClipboard({
            tables: [users],
            selectedIds: ['t1'],
            areaIds: [],
            databaseType: DatabaseType.POSTGRESQL,
            createTable: () => Promise.resolve(),
            notify,
        })
    );
    fireEvent.keyDown(document, {
        key: 'c',
        code: 'KeyC',
        ctrlKey: os === 'windows',
        metaKey: os === 'mac',
    });
    return notify;
};

describe('EDT-228 the copy notice names the key of this platform', () => {
    beforeEach(() => clearCopiedTables());

    it('says Ctrl+V on Windows and Linux', () => {
        os = 'windows';
        expect(copyOnce()).toHaveBeenCalledWith(
            'Table copied',
            'Press Ctrl+V to paste it.'
        );
    });

    it('says Cmd+V on a Mac', () => {
        os = 'mac';
        expect(copyOnce()).toHaveBeenCalledWith(
            'Table copied',
            'Press Cmd+V to paste it.'
        );
    });
});
