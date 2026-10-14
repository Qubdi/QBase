import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import type { MyProject, RemoteDiagramSummary } from '../api';
import {
    filterGroups,
    groupByProject,
    InvalidServerDiagramError,
    PERSONAL_LABEL,
    serverContentToDiagram,
} from '../open-remote';
import { findLocalId, setRemoteId } from '../remote-map';

const project = (id: string, name: string): MyProject => ({
    id,
    name,
    description: '',
    role: 'editor',
});

const diagram = (
    id: string,
    title: string,
    projectId: string | null,
    updatedAt = '2025-01-01T00:00:00.000Z'
): RemoteDiagramSummary => ({
    id,
    title,
    updatedAt,
    ownerId: 'u1',
    projectId,
    role: 'editor',
});

describe('groupByProject', () => {
    const projects = [project('p2', 'Zeta'), project('p1', 'Alpha')];

    it('lists projects alphabetically, even empty ones', () => {
        const groups = groupByProject([], projects);
        expect(groups.map((g) => g.label)).toEqual(['Alpha', 'Zeta']);
        expect(groups.every((g) => g.diagrams.length === 0)).toBe(true);
    });

    it('puts diagrams under their project, newest first', () => {
        const groups = groupByProject(
            [
                diagram('a', 'Old', 'p1', '2024-01-01T00:00:00.000Z'),
                diagram('b', 'New', 'p1', '2025-06-01T00:00:00.000Z'),
                diagram('c', 'Other', 'p2'),
            ],
            projects
        );
        expect(groups[0].diagrams.map((d) => d.id)).toEqual(['b', 'a']);
        expect(groups[1].diagrams.map((d) => d.id)).toEqual(['c']);
    });

    it('collects project-less diagrams under Personal, last', () => {
        const groups = groupByProject(
            [
                diagram('x', 'Mine', null),
                diagram('y', 'Mine too', undefined as never),
            ],
            projects
        );
        const last = groups[groups.length - 1];
        expect(last.label).toBe(PERSONAL_LABEL);
        expect(last.projectId).toBeNull();
        expect(last.diagrams).toHaveLength(2);
    });

    it('omits Personal when there is nothing in it', () => {
        const groups = groupByProject([diagram('a', 'A', 'p1')], projects);
        expect(groups.some((g) => g.label === PERSONAL_LABEL)).toBe(false);
    });

    it('does not lose a diagram whose project the user no longer lists', () => {
        const groups = groupByProject([diagram('a', 'A', 'gone')], projects);
        expect(groups[groups.length - 1].diagrams.map((d) => d.id)).toEqual([
            'a',
        ]);
    });
});

describe('filterGroups', () => {
    const groups = groupByProject(
        [diagram('a', 'Invoices', 'p1'), diagram('b', 'Users', 'p2')],
        [project('p1', 'Billing'), project('p2', 'Core')]
    );

    it('returns everything for a blank query', () => {
        expect(filterGroups(groups, '  ')).toBe(groups);
    });

    it('matches titles case-insensitively and drops empty groups', () => {
        const res = filterGroups(groups, 'INVO');
        expect(res).toHaveLength(1);
        expect(res[0].diagrams[0].id).toBe('a');
    });
});

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
