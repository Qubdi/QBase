import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Dexie from 'dexie';
import {
    adoptLegacyLocalData,
    claimLocalData,
    clearLocalUserData,
    LEGACY_LOCAL_DB_NAME,
    LOCAL_DB_NAME,
    LOCAL_OWNER_KEY,
} from '../local-data';

const expectBothDeleted = (deleteDatabase: ReturnType<typeof vi.fn>) => {
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
    expect(deleteDatabase).toHaveBeenCalledWith(LOCAL_DB_NAME);
    expect(deleteDatabase).toHaveBeenCalledWith(LEGACY_LOCAL_DB_NAME);
};

describe('clearLocalUserData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes the qbase.* keys from both storages and keeps the rest', async () => {
        localStorage.setItem('qbase.remote-map', '{}');
        localStorage.setItem('qbase.sent-content', '{}');
        localStorage.setItem('theme', 'dark');
        sessionStorage.setItem('qbase.editor-id', 'tab');
        sessionStorage.setItem('other', '1');
        await clearLocalUserData(async () => undefined);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(localStorage.getItem('qbase.sent-content')).toBeNull();
        expect(sessionStorage.getItem('qbase.editor-id')).toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(sessionStorage.getItem('other')).toBe('1');
    });

    it('deletes the local diagrams database, under the new and the old name', async () => {
        const deleteDatabase = vi.fn(async () => undefined);
        await clearLocalUserData(deleteDatabase);
        expectBothDeleted(deleteDatabase);
    });

    it('still clears the keys when the database cannot be deleted', async () => {
        localStorage.setItem('qbase.remote-map', '{}');
        await expect(
            clearLocalUserData(async () => {
                throw new Error('blocked');
            })
        ).resolves.toBeUndefined();
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
    });

    it('still deletes the database when reading the storages throws', async () => {
        const blocked = () => {
            throw new DOMException('blocked', 'SecurityError');
        };
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked);
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(blocked);
        const deleteDatabase = vi.fn(async () => undefined);
        try {
            await expect(
                clearLocalUserData(deleteDatabase)
            ).resolves.toBeUndefined();
        } finally {
            vi.restoreAllMocks();
        }
        expectBothDeleted(deleteDatabase);
    });
});

describe('claimLocalData', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('records the owner on a browser with no earlier owner, without clearing anything', async () => {
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-1');
        expect(localStorage.getItem('qbase.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it('leaves the copies alone for the same person coming back', async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-1', deleteDatabase)).toBe(false);
        expect(localStorage.getItem('qbase.remote-map')).toBe('{"a":"b"}');
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it("clears another person's copies, then records the new owner", async () => {
        await claimLocalData('user-1', async () => undefined);
        localStorage.setItem('qbase.remote-map', '{"a":"b"}');
        sessionStorage.setItem('qbase.editor-id', 'tab');
        localStorage.setItem('theme', 'dark');
        const deleteDatabase = vi.fn(async () => undefined);
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(true);
        expectBothDeleted(deleteDatabase);
        expect(localStorage.getItem('qbase.remote-map')).toBeNull();
        expect(sessionStorage.getItem('qbase.editor-id')).toBeNull();
        expect(localStorage.getItem(LOCAL_OWNER_KEY)).toBe('user-2');
        expect(localStorage.getItem('theme')).toBe('dark');
        // and the next claim by the new owner is quiet
        expect(await claimLocalData('user-2', deleteDatabase)).toBe(false);
    });
});

type Rows = Record<string, unknown[]>;

/** A stand-in for a Dexie database holding `rows`, enough for adoptLegacyLocalData. */
const fakeDb = (rows: Rows, failOpen = false) => {
    const tables = Object.keys(rows).map((name) => ({
        name,
        count: async () => rows[name].length,
        toArray: async () => [...rows[name]],
        toCollection: () => ({
            primaryKeys: async () =>
                rows[name].map((row) => (row as { id: unknown }).id),
        }),
        schema: { primKey: { keyPath: 'id' } },
        bulkPut: async (items: unknown[]) => {
            rows[name].push(...items);
        },
    }));
    const db = {
        tables,
        table: (name: string) => tables.find((table) => table.name === name)!,
        open: vi.fn(async () => {
            if (failOpen) throw new Error('blocked');
        }),
        close: vi.fn(),
        transaction: async (
            _mode: string,
            _tables: unknown,
            work: () => Promise<void>
        ) => {
            // all or nothing, like an IndexedDB transaction
            const before = structuredClone(rows);
            try {
                await work();
            } catch (error) {
                Object.assign(rows, before);
                throw error;
            }
        },
    };
    return db as typeof db & Dexie;
};

describe('adoptLegacyLocalData', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('copies every table from the old database, then deletes it', async () => {
        const target = fakeDb({ diagrams: [], db_tables: [], config: [] });
        const legacy = fakeDb({
            diagrams: [{ id: 'd1' }],
            db_tables: [{ id: 't1', diagramId: 'd1' }],
            config: [{ id: 1, defaultDiagramId: 'd1' }],
            not_in_target: [{ id: 'x' }],
        });
        const deleteDatabase = vi.fn(async () => undefined);
        await adoptLegacyLocalData(
            target,
            () => legacy,
            async () => true,
            deleteDatabase
        );
        expect(await target.table('diagrams').toArray()).toEqual([
            { id: 'd1' },
        ]);
        expect(await target.table('db_tables').toArray()).toEqual([
            { id: 't1', diagramId: 'd1' },
        ]);
        expect(await target.table('config').toArray()).toEqual([
            { id: 1, defaultDiagramId: 'd1' },
        ]);
        expect(target.tables.map((table) => table.name)).not.toContain(
            'not_in_target'
        );
        expect(legacy.close).toHaveBeenCalled();
        expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(
            LEGACY_LOCAL_DB_NAME
        );
    });

    it('does nothing when there is no old database', async () => {
        const openLegacy = vi.fn();
        const deleteDatabase = vi.fn(async () => undefined);
        await adoptLegacyLocalData(
            fakeDb({ diagrams: [] }),
            openLegacy,
            async () => false,
            deleteDatabase
        );
        expect(openLegacy).not.toHaveBeenCalled();
        expect(deleteDatabase).not.toHaveBeenCalled();
    });

    it('adds what the new database lacks and keeps what it already has', async () => {
        const target = fakeDb({ diagrams: [{ id: 'new' }, { id: 'both', v: 2 }] });
        const legacy = fakeDb({ diagrams: [{ id: 'both', v: 1 }, { id: 'old' }] });
        const deleteDatabase = vi.fn(async () => undefined);
        await adoptLegacyLocalData(
            target,
            () => legacy,
            async () => true,
            deleteDatabase
        );
        expect(await target.table('diagrams').toArray()).toEqual([
            { id: 'new' },
            { id: 'both', v: 2 },
            { id: 'old' },
        ]);
        expect(deleteDatabase).toHaveBeenCalledExactlyOnceWith(
            LEGACY_LOCAL_DB_NAME
        );
    });

    it('keeps the old database when it cannot be read, and does not throw', async () => {
        const target = fakeDb({ diagrams: [] });
        const legacy = fakeDb({ diagrams: [{ id: 'd1' }] }, true);
        const deleteDatabase = vi.fn(async () => undefined);
        await expect(
            adoptLegacyLocalData(
                target,
                () => legacy,
                async () => true,
                deleteDatabase
            )
        ).resolves.toBeUndefined();
        expect(legacy.close).toHaveBeenCalled();
        expect(deleteDatabase).not.toHaveBeenCalled();
        expect(await target.table('diagrams').toArray()).toEqual([]);
    });

    it('keeps the old database when the copy fails part way', async () => {
        const target = fakeDb({ diagrams: [], db_tables: [] });
        target.table('db_tables').bulkPut = async () => {
            throw new Error('quota');
        };
        const legacy = fakeDb({
            diagrams: [{ id: 'd1' }],
            db_tables: [{ id: 't1' }],
        });
        const deleteDatabase = vi.fn(async () => undefined);
        await adoptLegacyLocalData(
            target,
            () => legacy,
            async () => true,
            deleteDatabase
        );
        expect(deleteDatabase).not.toHaveBeenCalled();
        expect(await target.table('diagrams').toArray()).toEqual([]);
    });
});
