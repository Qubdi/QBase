import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import {
    InvalidServerDiagramError,
    serverContentToDiagram,
} from '../open-remote';
import { findLocalId, setRemoteId } from '../remote-map';

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
