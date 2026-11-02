import { describe, expect, it } from 'vitest';
import {
    buildShareUrl,
    buildViewerGraph,
    edgeTouches,
    relatedTableIds,
    searchTables,
} from '../viewer-model';

const content = {
    tables: [
        {
            id: 't1',
            name: 'users',
            schema: 'public',
            x: 10,
            y: 20,
            color: '#ff0000',
            isView: false,
            fields: [
                {
                    id: 'f1',
                    name: 'id',
                    type: { id: 'int', name: 'integer' },
                    primaryKey: true,
                    nullable: false,
                    unique: true,
                },
                {
                    id: 'f2',
                    name: 'email',
                    type: { id: 'text', name: 'text' },
                    primaryKey: false,
                    nullable: false,
                    unique: true,
                },
            ],
        },
        {
            id: 't2',
            name: 'orders',
            x: 400,
            y: 20,
            fields: [
                {
                    id: 'f3',
                    name: 'user_id',
                    type: { name: 'integer' },
                    nullable: true,
                },
            ],
        },
        { id: 't3', name: 'audit', fields: [] },
    ],
    relationships: [
        {
            id: 'r1',
            name: 'orders_user',
            sourceTableId: 't2',
            targetTableId: 't1',
        },
        {
            id: 'r2',
            name: 'dangling',
            sourceTableId: 't2',
            targetTableId: 'missing',
        },
    ],
};

describe('buildViewerGraph', () => {
    it('maps tables, fields and edges', () => {
        const g = buildViewerGraph(content);
        expect(g.tables.map((t) => t.name)).toEqual([
            'users',
            'orders',
            'audit',
        ]);
        const users = g.tables[0];
        expect(users).toMatchObject({
            x: 10,
            y: 20,
            color: '#ff0000',
            schema: 'public',
        });
        expect(users.fields[0]).toMatchObject({
            name: 'id',
            type: 'integer',
            primaryKey: true,
            nullable: false,
        });
        expect(g.edges).toEqual([
            { id: 'r1', source: 't2', target: 't1', label: 'orders_user' },
        ]);
    });

    it('drops edges that point at missing tables', () => {
        expect(buildViewerGraph(content).edges.some((e) => e.id === 'r2')).toBe(
            false
        );
    });

    it('fills defaults and lays out tables that have no coordinates', () => {
        const g = buildViewerGraph(content);
        const audit = g.tables[2];
        expect(audit.color).toBe('#8eb7ff');
        expect(Number.isFinite(audit.x)).toBe(true);
        expect(Number.isFinite(audit.y)).toBe(true);
        expect(g.tables[1].fields[0].nullable).toBe(true);
    });

    it('never throws on malformed content', () => {
        for (const bad of [
            null,
            undefined,
            42,
            'x',
            [],
            {},
            { tables: 'nope' },
            { tables: [null, 1, {}, { id: 5 }] },
            {
                tables: [{ id: 't', fields: [null, { id: 1 }] }],
                relationships: [null, 'x'],
            },
        ]) {
            expect(() => buildViewerGraph(bad)).not.toThrow();
        }
        expect(
            buildViewerGraph({
                tables: [{ id: 't', fields: [null, { id: 1 }] }],
            }).tables[0].fields
        ).toEqual([]);
    });
});

describe('searchTables', () => {
    const { tables } = buildViewerGraph(content);

    it('returns null for an empty query', () => {
        expect(searchTables(tables, '')).toBeNull();
        expect(searchTables(tables, '   ')).toBeNull();
    });

    it('matches table, schema and field names case-insensitively', () => {
        expect([...searchTables(tables, 'USER')!].sort()).toEqual(['t1', 't2']);
        expect([...searchTables(tables, 'public')!]).toEqual(['t1']);
        expect([...searchTables(tables, 'email')!]).toEqual(['t1']);
    });

    it('returns an empty set when nothing matches', () => {
        expect(searchTables(tables, 'zzz')!.size).toBe(0);
    });
});

describe('relations', () => {
    const { edges } = buildViewerGraph(content);

    it('finds the clicked table and its neighbours in both directions', () => {
        expect([...relatedTableIds(edges, 't1')].sort()).toEqual(['t1', 't2']);
        expect([...relatedTableIds(edges, 't2')].sort()).toEqual(['t1', 't2']);
    });

    it('keeps an unrelated table alone', () => {
        expect([...relatedTableIds(edges, 't3')]).toEqual(['t3']);
    });

    it('knows which edges touch a table', () => {
        expect(edgeTouches(edges[0], 't1')).toBe(true);
        expect(edgeTouches(edges[0], 't3')).toBe(false);
    });
});

describe('buildShareUrl', () => {
    it('joins origin and token without a double slash', () => {
        expect(buildShareUrl('https://db.example.com', 'abc')).toBe(
            'https://db.example.com/s/abc'
        );
        expect(buildShareUrl('https://db.example.com/', 'abc')).toBe(
            'https://db.example.com/s/abc'
        );
    });
});
