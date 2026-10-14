import { describe, expect, it } from 'vitest';
import {
    describeTarget,
    summarizeByTarget,
    targetKey,
    targetOptions,
    tablesWithComments,
    type CommentLike,
} from '../comments-model';
import { buildViewerGraph } from '../viewer-model';

const graph = buildViewerGraph({
    tables: [
        {
            id: 't1',
            name: 'users',
            x: 0,
            y: 0,
            fields: [
                { id: 'f1', name: 'id', type: { name: 'int' } },
                { id: 'f2', name: 'email', type: { name: 'text' } },
            ],
        },
        {
            id: 't2',
            name: 'orders',
            x: 1,
            y: 1,
            fields: [{ id: 'f3', name: 'user_id', type: { name: 'int' } }],
        },
    ],
    relationships: [
        {
            id: 'r1',
            name: 'orders_user_fk',
            sourceTableId: 't2',
            targetTableId: 't1',
        },
        { id: 'r2', name: '', sourceTableId: 't1', targetTableId: 't2' },
    ],
});

const c = (
    id: string,
    targetType: CommentLike['targetType'],
    targetId: string,
    resolved = false
): CommentLike => ({ id, targetType, targetId, body: 'x', resolved });

describe('summarizeByTarget', () => {
    it('counts open and total comments per target', () => {
        const map = summarizeByTarget([
            c('1', 'table', 't1'),
            c('2', 'table', 't1', true),
            c('3', 'field', 'f1'),
        ]);
        expect(map.get(targetKey('table', 't1'))).toEqual({
            open: 1,
            total: 2,
        });
        expect(map.get(targetKey('field', 'f1'))).toEqual({
            open: 1,
            total: 1,
        });
        expect(map.get(targetKey('table', 'nope'))).toBeUndefined();
    });

    it('keeps target types apart even when ids collide', () => {
        const map = summarizeByTarget([
            c('1', 'table', 'x'),
            c('2', 'field', 'x'),
        ]);
        expect(map.size).toBe(2);
    });

    it('is empty for no comments', () => {
        expect(summarizeByTarget([]).size).toBe(0);
    });
});

describe('describeTarget', () => {
    it('names tables, fields and relationships', () => {
        expect(describeTarget(graph, 'table', 't1')).toBe('users');
        expect(describeTarget(graph, 'field', 'f2')).toBe('users.email');
        expect(describeTarget(graph, 'relationship', 'r1')).toBe(
            'orders_user_fk'
        );
    });

    it('falls back for unnamed relationships and unknown targets', () => {
        expect(describeTarget(graph, 'relationship', 'r2')).toBe(
            'relationship'
        );
        expect(describeTarget(graph, 'table', 'gone')).toBeNull();
        expect(describeTarget(graph, 'field', 'gone')).toBeNull();
        expect(describeTarget(graph, 'relationship', 'gone')).toBeNull();
    });
});

describe('targetOptions', () => {
    it('lists tables, their fields and relationships', () => {
        const labels = targetOptions(graph).map((o) => `${o.type}:${o.label}`);
        expect(labels).toEqual([
            'table:users',
            'field:users.id',
            'field:users.email',
            'table:orders',
            'field:orders.user_id',
            'relationship:orders_user_fk',
            'relationship:relationship',
        ]);
    });
});

describe('tablesWithComments', () => {
    it('includes tables commented directly or through a field', () => {
        const ids = tablesWithComments(graph, [
            c('1', 'table', 't1'),
            c('2', 'field', 'f3'),
            c('3', 'relationship', 'r1'),
            c('4', 'field', 'ghost'),
        ]);
        expect([...ids].sort()).toEqual(['t1', 't2']);
    });
});
