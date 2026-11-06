import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import { diagramToServerContent } from '../content';
import {
    clearBaseUpdatedAt,
    getBaseUpdatedAt,
    setBaseUpdatedAt,
} from '../remote-version';
import { markSyncedContent } from '../sent-content';
import {
    ensureLocalCopy,
    InvalidServerDiagramError,
    serverContentToDiagram,
    UnpublishedDiagramError,
} from '../open-remote';
import {
    getSyncState,
    handOffSyncState,
    setSyncState,
    type SyncState,
} from '../sync-state';
import {
    findLocalId,
    getProjectId,
    getRemoteId,
    setRemoteId,
} from '../remote-map';

describe('serverContentToDiagram', () => {
    const content = {
        id: 'someone-elses-local-id',
        name: 'Shop',
        databaseType: DatabaseType.POSTGRESQL,
        tables: [],
        relationships: [],
        createdAt: '2025-03-01T10:00:00.000Z',
        updatedAt: '2025-03-02T10:00:00.000Z',
    };

    it('revives dates and assigns the new local id', () => {
        const d = serverContentToDiagram(content, { localId: 'mine' });
        expect(d.id).toBe('mine');
        expect(d.createdAt).toBeInstanceOf(Date);
        expect(d.updatedAt.toISOString()).toBe('2025-03-02T10:00:00.000Z');
        expect(d.name).toBe('Shop');
    });

    it('falls back to now when dates are missing or broken', () => {
        const d = serverContentToDiagram(
            { ...content, createdAt: 'nope', updatedAt: undefined },
            { localId: 'mine' }
        );
        expect(Number.isNaN(d.createdAt.getTime())).toBe(false);
        expect(Number.isNaN(d.updatedAt.getTime())).toBe(false);
    });

    it('lets the caller override the name', () => {
        expect(
            serverContentToDiagram(content, { localId: 'm', name: 'Renamed' })
                .name
        ).toBe('Renamed');
    });

    it('rejects a viewer copy that was never published (null content)', () => {
        expect(() => serverContentToDiagram(null, { localId: 'm' })).toThrow(
            InvalidServerDiagramError
        );
    });

    it('rejects content that is not a diagram', () => {
        expect(() =>
            serverContentToDiagram({ hello: 'world' }, { localId: 'm' })
        ).toThrow(InvalidServerDiagramError);
    });
});

describe('findLocalId', () => {
    beforeEach(() => localStorage.clear());

    it('finds the local diagram synced to a server diagram', () => {
        setRemoteId('local-1', 'remote-1');
        setRemoteId('local-2', 'remote-2');
        expect(findLocalId('remote-2')).toBe('local-2');
        expect(findLocalId('remote-9')).toBeUndefined();
    });
});

describe('ensureLocalCopy', () => {
    const remoteContent = {
        id: 'author-local-id',
        name: 'Shop',
        databaseType: DatabaseType.POSTGRESQL,
        tables: [],
        createdAt: '2025-03-01T10:00:00.000Z',
        updatedAt: '2025-03-02T10:00:00.000Z',
    };

    const setup = (content: Record<string, unknown> | null = remoteContent) => {
        const added: string[] = [];
        let fetches = 0;
        const args = (localIds: string[] = []) => ({
            remoteId: 'remote-1',
            projectId: 'p1',
            localIds: new Set(localIds),
            fetchRemote: async () => {
                fetches++;
                return { title: 'Shop (server)', content };
            },
            addDiagram: async (d: { id: string }) => {
                added.push(d.id);
            },
            newId: () => 'fresh-local-id',
        });
        return { args, added, fetches: () => fetches };
    };

    beforeEach(() => localStorage.clear());

    it('downloads the diagram on the first visit and remembers the binding', async () => {
        const { args, added, fetches } = setup();
        const res = await ensureLocalCopy(args());
        expect(res).toEqual({ localId: 'fresh-local-id', created: true });
        expect(added).toEqual(['fresh-local-id']);
        expect(fetches()).toBe(1);
        expect(getRemoteId('fresh-local-id')).toBe('remote-1');
        expect(getProjectId('fresh-local-id')).toBe('p1');
    });

    it('gives the new copy the database source that Get latest kept', async () => {
        const state: SyncState = {
            dialect: 'postgresql',
            source: { kind: 'saved', savedConnectionId: 'c1' },
            tables: [],
            schemas: [],
            sourceKeys: { tables: {}, columns: {} },
            lastSyncedAt: '2026-01-01T00:00:00.000Z',
        };
        setSyncState('old-local', state);
        handOffSyncState('old-local', 'remote-1');
        const { args } = setup();
        await ensureLocalCopy(args());
        expect(getSyncState('fresh-local-id')).toEqual(state);
    });

    it('reuses the copy that is already in this browser', async () => {
        setRemoteId('mine', 'remote-1');
        const { args, added, fetches } = setup();
        const res = await ensureLocalCopy(args(['mine']));
        expect(res).toEqual({ localId: 'mine', created: false });
        expect(added).toEqual([]);
        expect(fetches()).toBe(0);
        expect(getProjectId('mine')).toBe('p1');
    });

    it('downloads again when the remembered copy was removed from the browser', async () => {
        setRemoteId('gone', 'remote-1');
        const { args, fetches } = setup();
        const res = await ensureLocalCopy(args([]));
        expect(res.created).toBe(true);
        expect(fetches()).toBe(1);
    });

    it('refuses a viewer’s copy that was never published', async () => {
        const { args, added } = setup(null);
        await expect(ensureLocalCopy(args())).rejects.toBeInstanceOf(
            UnpublishedDiagramError
        );
        expect(added).toEqual([]);
        expect(getRemoteId('fresh-local-id')).toBeUndefined();
    });

    it('does not remember a binding when the copy cannot be stored', async () => {
        const { args } = setup();
        await expect(
            ensureLocalCopy({
                ...args(),
                addDiagram: async () => {
                    throw new Error('disk full');
                },
            })
        ).rejects.toThrow('disk full');
        expect(getRemoteId('fresh-local-id')).toBeUndefined();
    });
});

describe('ensureLocalCopy: reopening a copy that is behind the server', () => {
    const BASE = '2025-03-02T10:00:00.000Z';
    let id = 'mine-0';
    let n = 0;
    const NEWER = '2025-03-05T09:00:00.000Z';
    const serverContent = {
        id: 'author-local-id',
        name: 'Shop',
        databaseType: DatabaseType.POSTGRESQL,
        tables: [],
        relationships: [],
        createdAt: '2025-03-01T10:00:00.000Z',
        updatedAt: NEWER,
    };
    const localCopy = (over: Partial<Diagram> = {}): Diagram =>
        ({
            id,
            name: 'Shop',
            databaseType: DatabaseType.POSTGRESQL,
            tables: [],
            relationships: [],
            createdAt: new Date('2025-03-01T10:00:00.000Z'),
            updatedAt: new Date(BASE),
            ...over,
        }) as Diagram;

    const run = async (opts: {
        readOnly: boolean;
        serverUpdatedAt?: string;
        local?: Diagram | undefined;
    }) => {
        const calls: string[] = [];
        const added: Diagram[] = [];
        const result = await ensureLocalCopy({
            remoteId: 'remote-1',
            projectId: 'p1',
            localIds: new Set([id]),
            fetchRemote: async () => {
                calls.push('fetch');
                return {
                    title: 'Shop (server)',
                    content: serverContent as Record<string, unknown>,
                    updatedAt: NEWER,
                };
            },
            addDiagram: async (d) => {
                calls.push('add');
                added.push(d);
            },
            newId: () => 'unused',
            refresh: {
                serverUpdatedAt: opts.serverUpdatedAt ?? NEWER,
                readOnly: opts.readOnly,
                getLocal: async () =>
                    'local' in opts ? opts.local : localCopy(),
                deleteLocal: async () => {
                    calls.push('delete');
                },
            },
        });
        return { result, calls, added };
    };

    beforeEach(() => {
        id = `mine-${++n}`;
        localStorage.clear();
        sessionStorage.clear();
        setRemoteId(id, 'remote-1');
        setBaseUpdatedAt(id, BASE);
    });

    it("replaces a viewer's copy once the server has a newer version", async () => {
        const { result, calls, added } = await run({ readOnly: true });
        expect(result).toEqual({
            localId: id,
            created: false,
            refreshed: true,
        });
        expect(calls).toEqual(['fetch', 'delete', 'add']);
        expect(added[0].id).toBe(id);
        expect(added[0].name).toBe('Shop (server)');
        expect(getBaseUpdatedAt(id)).toBe(NEWER);
    });

    it('leaves a copy alone when the server has nothing newer', async () => {
        const { result, calls } = await run({
            readOnly: true,
            serverUpdatedAt: BASE,
        });
        expect(result).toEqual({ localId: id, created: false });
        expect(calls).toEqual([]);
    });

    it('replaces an editor copy that still equals what it last shared with the server', async () => {
        markSyncedContent(id, diagramToServerContent(localCopy()));
        const { result, calls } = await run({ readOnly: false });
        expect(result.refreshed).toBe(true);
        expect(calls).toEqual(['fetch', 'delete', 'add']);
    });

    it('never replaces an editor copy that has edits the server lacks', async () => {
        markSyncedContent(id, diagramToServerContent(localCopy()));
        const edited = localCopy({ name: 'Shop, edited offline' });
        const { result, calls } = await run({ readOnly: false, local: edited });
        expect(result).toEqual({ localId: id, created: false });
        expect(calls).toEqual([]);
        expect(getBaseUpdatedAt(id)).toBe(BASE);
    });

    it('does not guess for an editor copy made before this was recorded', async () => {
        const { result, calls } = await run({ readOnly: false });
        expect(result).toEqual({ localId: id, created: false });
        expect(calls).toEqual([]);
    });

    it('does not touch a copy that has no recorded base version', async () => {
        clearBaseUpdatedAt(id);
        const { result, calls } = await run({ readOnly: true });
        expect(result).toEqual({ localId: id, created: false });
        expect(calls).toEqual([]);
    });
});
