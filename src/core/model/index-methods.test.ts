import { describe, expect, it } from 'vitest';
import { planAddKey, planUpdateKey } from '../commands/plan-column';
import type { Command } from '../commands/command';
import { applyOk, NOW, rng, withTables } from '../testing/helpers';
import type { Column } from './column';
import type { DatabaseType } from './database';
import {
    columnsBlockingUnique,
    defaultMethodOf,
    INDEX_METHODS,
    methodCannotBeUnique,
    methodProblem,
} from './index-methods';
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

describe('the index types that cannot be unique', () => {
    /** fields that meet every other rule of the type, so `notUnique` is the only thing left */
    const fitting = (db: DatabaseType, method: Key['algorithm'] & string) => {
        if (method === 'gin') return [column('jsonb')];
        if (method === 'fulltext') return [column('text')];
        if (method === 'spatial') return [column('geometry')];
        if (method === 'xml') return [column('xml')];
        return [column(db === 'oracle' ? 'number' : 'int')];
    };

    it('is the same as the notUnique answer of methodProblem, for every type of every database', () => {
        for (const db of Object.keys(INDEX_METHODS) as DatabaseType[])
            for (const method of INDEX_METHODS[db]) {
                const columns = fitting(db, method);
                // without the unique flag nothing is wrong, so the flag is what is refused
                expect(
                    problem(db, method, columns, false),
                    `${db} ${method}`
                ).toBeUndefined();
                expect(
                    problem(db, method, columns, true) === 'notUnique',
                    `${db} ${method}`
                ).toBe(methodCannotBeUnique(db, method));
            }
    });

    it('only btree is unique on PostgreSQL; nonclustered and clustered are on SQL Server', () => {
        expect(
            INDEX_METHODS.postgresql.filter(
                (m) => !methodCannotBeUnique('postgresql', m)
            )
        ).toEqual(['btree']);
        expect(
            INDEX_METHODS.sql_server.filter(
                (m) => !methodCannotBeUnique('sql_server', m)
            )
        ).toEqual(['nonclustered', 'clustered']);
    });

    it('has no answer where there is no choice of type', () => {
        expect(methodCannotBeUnique('sqlite', undefined)).toBe(false);
        expect(methodCannotBeUnique('postgresql', undefined)).toBe(false);
        expect(methodCannotBeUnique('sqlite', 'btree')).toBe(false);
    });
});

describe('the column types a database refuses in a unique index', () => {
    const blocking = (db: DatabaseType, ...columns: Column[]) =>
        columnsBlockingUnique(db, columns).map((c) => c.type.id);

    it('PostgreSQL: json, xml and the geometric types, also as an array', () => {
        for (const type of ['json', 'xml', 'point', 'box', 'polygon'])
            expect(blocking('postgresql', column(type)), type).toEqual([type]);
        expect(
            blocking('postgresql', column('json', { isArray: true }))
        ).toEqual(['json']);
        for (const type of ['jsonb', 'text', 'uuid', 'bytea', 'int4range'])
            expect(blocking('postgresql', column(type)), type).toEqual([]);
    });

    it('MySQL and MariaDB: text, blob, json and spatial types', () => {
        for (const db of ['mysql', 'mariadb'] as const) {
            for (const type of [
                'tinytext',
                'text',
                'longtext',
                'blob',
                'longblob',
                'json',
                'geometry',
                'point',
            ])
                expect(blocking(db, column(type)), `${db} ${type}`).toEqual([
                    type,
                ]);
            for (const type of ['varchar', 'char', 'varbinary', 'int', 'enum'])
                expect(blocking(db, column(type)), `${db} ${type}`).toEqual([]);
        }
    });

    it('SQL Server: text, ntext, image, xml, spatial types, and a max length', () => {
        for (const type of ['text', 'ntext', 'image', 'xml', 'geography'])
            expect(blocking('sql_server', column(type)), type).toEqual([type]);
        for (const type of ['varchar', 'nvarchar', 'varbinary']) {
            expect(
                blocking('sql_server', column(type, { length: 'max' })),
                `${type}(max)`
            ).toEqual([type]);
            expect(
                blocking('sql_server', column(type, { length: 100 })),
                `${type}(100)`
            ).toEqual([]);
        }
        // `max` is a SQL Server length only
        expect(blocking('mysql', column('varchar', { length: 'max' }))).toEqual(
            []
        );
    });

    it('Oracle: lob, bfile, long raw and xmltype', () => {
        for (const type of ['clob', 'nclob', 'blob', 'bfile', 'xmltype'])
            expect(blocking('oracle', column(type)), type).toEqual([type]);
        // the catalogue writes `long raw` with an underscore in the id; a space is read the same
        expect(blocking('oracle', column('long_raw'))).toEqual(['long_raw']);
        expect(blocking('oracle', column('long raw'))).toEqual(['long raw']);
        for (const type of ['varchar2', 'number', 'date', 'raw'])
            expect(blocking('oracle', column(type)), type).toEqual([]);
    });

    it('SQLite takes every type, and the case of the id does not matter', () => {
        for (const type of ['json', 'blob', 'text', 'null'])
            expect(blocking('sqlite', column(type)), type).toEqual([]);
        expect(blocking('postgresql', column('JSON'))).toEqual(['JSON']);
    });

    it('lists only the columns that are refused, in the order given', () => {
        expect(
            columnsBlockingUnique('mysql', [
                column('int', { name: 'a' }),
                column('json', { name: 'b' }),
                column('varchar', { name: 'c' }),
                column('text', { name: 'd' }),
            ]).map((c) => c.name)
        ).toEqual(['b', 'd']);
        expect(columnsBlockingUnique('mysql', [])).toEqual([]);
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
