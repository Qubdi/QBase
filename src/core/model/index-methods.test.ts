import { describe, expect, it } from 'vitest';
import { planAddKey, planUpdateKey } from '../commands/plan-column';
import type { Command } from '../commands/command';
import { applyOk, NOW, rng, withTables } from '../testing/helpers';
import type { Column } from './column';
import type { DatabaseType } from './database';
import { defaultMethodOf, methodProblem } from './index-methods';
import type { IndexSurroundings } from './index-methods';
import type { Key } from './key';

const column = (type: string, over: Partial<Column> = {}): Column =>
    ({ id: 'c', name: 'c', type: { id: type, name: type }, ...over }) as Column;
const key = (algorithm: Key['algorithm'], id = 'k'): Key =>
    ({
        id,
        label: id,
        members: [],
        distinct: false,
        madeAt: 0,
        algorithm,
    }) as Key;
const alone: IndexSurroundings = { others: [], hasPrimaryKey: true };

const problem = (
    db: DatabaseType,
    method: Key['algorithm'] & string,
    columns: Column[],
    unique = false,
    around = alone
) => methodProblem(db, method, columns, unique, around);

describe('what each database refuses for an index type', () => {
    it('PostgreSQL: gin needs array or json columns, hash takes one field, only btree is unique', () => {
        expect(problem('postgresql', 'gin', [column('text')])).toBe(
            'arrayOrJson'
        );
        expect(problem('postgresql', 'gin', [column('jsonb')])).toBeUndefined();
        expect(
            problem('postgresql', 'gin', [column('int', { isArray: true })])
        ).toBeUndefined();
        expect(
            problem('postgresql', 'hash', [column('int'), column('int')])
        ).toBe('oneField');
        expect(problem('postgresql', 'hash', [column('int')])).toBeUndefined();
        for (const m of ['hash', 'gist', 'spgist', 'brin'] as const)
            expect(problem('postgresql', m, [column('int')], true), m).toBe(
                'notUnique'
            );
        expect(
            problem('postgresql', 'btree', [column('int')], true)
        ).toBeUndefined();
        expect(problem('postgresql', 'brin', [column('int')])).toBeUndefined();
    });

    it('MySQL and MariaDB: fulltext needs text columns, spatial one geometry column, neither is unique', () => {
        for (const db of ['mysql', 'mariadb'] as const) {
            expect(
                problem(db, 'fulltext', [column('varchar'), column('text')])
            ).toBeUndefined();
            expect(problem(db, 'fulltext', [column('int')])).toBe('needsText');
            expect(problem(db, 'fulltext', [])).toBe('needsText');
            expect(problem(db, 'fulltext', [column('text')], true)).toBe(
                'notUnique'
            );
            expect(
                problem(db, 'spatial', [column('geometry')])
            ).toBeUndefined();
            expect(
                problem(db, 'spatial', [column('point'), column('point')])
            ).toBe('needsGeometry');
            expect(problem(db, 'spatial', [column('varchar')])).toBe(
                'needsGeometry'
            );
            expect(problem(db, 'spatial', [column('point')], true)).toBe(
                'notUnique'
            );
            expect(problem(db, 'hash', [column('int')], true)).toBeUndefined();
        }
    });

    it('SQL Server: one clustered and one columnstore per table, xml needs one xml field and a primary key', () => {
        const around = (...others: Key[]) => ({ others, hasPrimaryKey: true });
        expect(
            problem(
                'sql_server',
                'clustered',
                [column('int')],
                false,
                around(key('clustered'))
            )
        ).toBe('oneClustered');
        expect(
            problem(
                'sql_server',
                'clustered',
                [column('int')],
                true,
                around(key('nonclustered'))
            )
        ).toBeUndefined();
        expect(
            problem(
                'sql_server',
                'columnstore',
                [column('int')],
                false,
                around(key('columnstore'))
            )
        ).toBe('oneColumnstore');
        expect(
            problem('sql_server', 'columnstore', [column('int')], true)
        ).toBe('notUnique');
        expect(problem('sql_server', 'xml', [column('xml')])).toBeUndefined();
        expect(problem('sql_server', 'xml', [column('nvarchar')])).toBe(
            'needsXml'
        );
        expect(
            problem('sql_server', 'xml', [column('xml')], false, {
                others: [],
                hasPrimaryKey: false,
            })
        ).toBe('needsPrimaryKey');
        expect(
            problem('sql_server', 'nonclustered', [column('int')], true)
        ).toBeUndefined();
    });

    it('Oracle: a bitmap index cannot be unique', () => {
        expect(problem('oracle', 'bitmap', [column('number')], true)).toBe(
            'notUnique'
        );
        expect(problem('oracle', 'bitmap', [column('number')])).toBeUndefined();
        expect(
            problem('oracle', 'btree', [column('number')], true)
        ).toBeUndefined();
    });
});

describe('an index keeps a type its database accepts', () => {
    function withIndex(db: DatabaseType, algorithm: Key['algorithm']) {
        const d = withTables(['a'], db);
        const entity = d.entities.order[0];
        const added = planAddKey(d, entity, {
            now: NOW,
            random: rng(2),
            algorithm,
        }) as Extract<Command, { type: 'part.insert' }>;
        const next = applyOk(d, added).design;
        return { d: next, entity, key: (added.item as Key).id };
    }

    it('making a bitmap index unique resets it to the first type', () => {
        const { d, entity, key: id } = withIndex('oracle', 'bitmap');
        const next = applyOk(
            d,
            planUpdateKey(d, entity, id, { distinct: true })!
        ).design;
        expect(next.keys[id]).toMatchObject({
            distinct: true,
            algorithm: 'btree',
        });
    });

    it('renaming an index leaves its type alone', () => {
        const { d, entity, key: id } = withIndex('oracle', 'bitmap');
        const next = applyOk(
            d,
            planUpdateKey(d, entity, id, { label: 'x' })!
        ).design;
        expect(next.keys[id]).toMatchObject({
            label: 'x',
            algorithm: 'bitmap',
        });
    });

    it('a second clustered index on SQL Server is refused by the choice, the first stays', () => {
        const { d, entity, key: id } = withIndex('sql_server', 'clustered');
        const second = planAddKey(d, entity, {
            now: NOW,
            random: rng(9),
        }) as Extract<Command, { type: 'part.insert' }>;
        const both = applyOk(d, second).design;
        expect(both.keys[id].algorithm).toBe('clustered');
        expect(defaultMethodOf('sql_server')).toBe('nonclustered');
        expect((second.item as Key).algorithm).toBe('nonclustered');
    });
});
