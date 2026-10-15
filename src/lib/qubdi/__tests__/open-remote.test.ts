import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import {
    ensureLocalCopy,
    InvalidServerDiagramError,
    serverContentToDiagram,
    UnpublishedDiagramError,
} from '../open-remote';
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
