import { beforeEach, describe, expect, it } from 'vitest';
import type { DBTable } from '@/qbase/diagram-types';
import {
    clearCopiedTables,
    copyTables,
    hasCopiedTables,
    planPaste,
} from '../table-clipboard';

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
            id: `${id}-f1`,
            name: 'id',
            type: { id: 'integer', name: 'integer' },
            primaryKey: true,
            unique: true,
            nullable: false,
            createdAt: 1,
        },
        {
            id: `${id}-f2`,
            name: 'email',
            type: { id: 'text', name: 'text' },
            primaryKey: false,
            unique: false,
            nullable: true,
            createdAt: 1,
        },
    ],
    indexes: [
        {
            id: `${id}-i1`,
            name: `${name}_email_idx`,
            unique: false,
            fieldIds: [`${id}-f2`],
            createdAt: 1,
        },
    ],
    ...over,
});

const keep = { keepSchema: true };

describe('table clipboard', () => {
    beforeEach(() => clearCopiedTables());

    describe('copyTables', () => {
        it('remembers the tables and reports how many', () => {
            expect(hasCopiedTables()).toBe(false);
            expect(
                copyTables([table('t1', 'users'), table('t2', 'orders')])
            ).toBe(2);
            expect(hasCopiedTables()).toBe(true);
        });

        it('keeps what was copied even if the original changes afterwards', () => {
            const users = table('t1', 'users');
            copyTables([users]);
            users.name = 'renamed';
            users.fields[0].name = 'changed';
            const [pasted] = planPaste([], keep);
            expect(pasted.name).toBe('users');
            expect(pasted.fields[0].name).toBe('id');
        });

        it('leaves an earlier copy alone when nothing is selected', () => {
            copyTables([table('t1', 'users')]);
            expect(copyTables([])).toBe(0);
            expect(planPaste([], keep)).toHaveLength(1);
        });

        it('can be cleared', () => {
            copyTables([table('t1', 'users')]);
            clearCopiedTables();
            expect(hasCopiedTables()).toBe(false);
            expect(planPaste([], keep)).toEqual([]);
        });
    });

    describe('planPaste', () => {
        it('pastes nothing when nothing was copied', () => {
            expect(planPaste([], keep)).toEqual([]);
        });

        it('creates new ids for the table, its fields and its indexes', () => {
            copyTables([table('t1', 'users')]);
            const [copy] = planPaste([], keep);
            expect(copy.id).not.toBe('t1');
            expect(copy.fields.map((f) => f.id)).not.toContain('t1-f1');
            expect(copy.fields.map((f) => f.id)).not.toContain('t1-f2');
            expect(copy.indexes[0].id).not.toBe('t1-i1');
            expect(
                new Set([
                    copy.id,
                    ...copy.fields.map((f) => f.id),
                    copy.indexes[0].id,
                ]).size
            ).toBe(4);
        });

        it('keeps the index pointing at the copy’s own field', () => {
            copyTables([table('t1', 'users')]);
            const [copy] = planPaste([], keep);
            const email = copy.fields.find((f) => f.name === 'email')!;
            expect(copy.indexes[0].fieldIds).toEqual([email.id]);
        });

        it('copies the content: fields, types, flags, color', () => {
            copyTables([table('t1', 'users', { color: '#ff6363' })]);
            const [copy] = planPaste([], keep);
            expect(copy.color).toBe('#ff6363');
            expect(
                copy.fields.map((f) => [
                    f.name,
                    f.type.id,
                    f.primaryKey,
                    f.nullable,
                ])
            ).toEqual([
                ['id', 'integer', true, false],
                ['email', 'text', false, true],
            ]);
        });

        it('does not produce anything but tables: no relationships or references', () => {
            copyTables([table('t1', 'users')]);
            const result = planPaste([], keep);
            expect(result.every((t) => Array.isArray(t.fields))).toBe(true);
            expect(JSON.stringify(result)).not.toMatch(
                /relationship|dependenc|targetTable|sourceTable/i
            );
        });

        it('keeps the name when nothing in the diagram uses it', () => {
            copyTables([table('t1', 'users')]);
            expect(
                planPaste([{ name: 'orders', schema: 'public' }], keep)[0].name
            ).toBe('users');
        });

        it('adds _copy when the name is taken, then _copy2, _copy3', () => {
            copyTables([table('t1', 'users')]);
            const existing = [{ name: 'users', schema: 'public' }];
            expect(planPaste(existing, keep)[0].name).toBe('users_copy');
            existing.push({ name: 'users_copy', schema: 'public' });
            expect(planPaste(existing, keep)[0].name).toBe('users_copy2');
            existing.push({ name: 'users_copy2', schema: 'public' });
            expect(planPaste(existing, keep)[0].name).toBe('users_copy3');
        });

        it('compares names ignoring case, and only within the same schema', () => {
            copyTables([table('t1', 'Users')]);
            expect(
                planPaste([{ name: 'USERS', schema: 'public' }], keep)[0].name
            ).toBe('Users_copy');
            expect(
                planPaste([{ name: 'Users', schema: 'billing' }], keep)[0].name
            ).toBe('Users');
        });

        it('gives tables copied together different names from each other', () => {
            copyTables([
                table('t1', 'users'),
                table('t2', 'users', { schema: 'public' }),
            ]);
            const names = planPaste([], keep).map((t) => t.name);
            expect(names).toEqual(['users', 'users_copy']);
        });

        it('puts each paste beside the last so copies do not overlap', () => {
            copyTables([table('t1', 'users', { x: 100, y: 200 })]);
            const first = planPaste([], keep)[0];
            const second = planPaste([], keep)[0];
            const third = planPaste([], keep)[0];
            // a 224 wide table plus a 40 gap
            expect([first.x, first.y]).toEqual([364, 200]);
            expect([second.x, second.y]).toEqual([628, 200]);
            expect([third.x, third.y]).toEqual([892, 200]);
        });

        it('keeps copied tables in the same arrangement as the originals', () => {
            copyTables([
                table('t1', 'a', { x: 0, y: 0 }),
                table('t2', 'b', { x: 300, y: 120 }),
            ]);
            const [a, b] = planPaste([], keep);
            expect([b.x - a.x, b.y - a.y]).toEqual([300, 120]);
        });

        it('starts offsets again after a new copy', () => {
            copyTables([table('t1', 'users', { x: 0, y: 0 })]);
            planPaste([], keep);
            planPaste([], keep);
            copyTables([table('t1', 'users', { x: 0, y: 0 })]);
            expect(planPaste([], keep)[0].x).toBe(264);
        });

        it('drops the schema for a database that has none', () => {
            copyTables([table('t1', 'users', { schema: 'public' })]);
            expect(
                planPaste([], { keepSchema: false })[0].schema
            ).toBeUndefined();
            expect(planPaste([], keep)[0].schema).toBe('public');
        });

        it('keeps the area only when it exists in the diagram being pasted into', () => {
            copyTables([table('t1', 'users', { parentAreaId: 'area-1' })]);
            expect(
                planPaste([], {
                    keepSchema: true,
                    areaIds: new Set(['area-1']),
                })[0].parentAreaId
            ).toBe('area-1');
            expect(
                planPaste([], {
                    keepSchema: true,
                    areaIds: new Set(['other']),
                })[0].parentAreaId
            ).toBeNull();
            expect(planPaste([], keep)[0].parentAreaId).toBeNull();
        });

        it('can paste the same copy many times with fresh ids each time', () => {
            copyTables([table('t1', 'users')]);
            const ids = [planPaste([], keep)[0].id, planPaste([], keep)[0].id];
            expect(new Set(ids).size).toBe(2);
        });
    });
});
