import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from './design-builder';

const builder = () =>
    new DesignBuilder({
        databaseType: 'postgresql',
        name: 'sample',
        now: Date.UTC(2026, 10, 7, 12, 0, 0),
        random: seededRandom(5),
        sort: false,
    });
const table = (name: string, schema?: string) => ({
    name,
    schema,
    columns: [{ name: 'id', typeName: 'int', nullable: false }],
    indexes: [],
    checks: [],
});

describe('DesignBuilder table lookup', () => {
    it('matches a name ignoring case, in exactly the schema asked for', () => {
        const b = builder();
        b.addTable(table('Users', 'app'));
        b.addTable(table('users', 'audit'));
        expect(b.hasTable('app', 'USERS')).toBe(true);
        expect(b.hasTable('audit', 'users')).toBe(true);
        expect(b.hasTable('other', 'users')).toBe(false);
        expect(b.hasTable(undefined, 'users')).toBe(false);
        expect(b.hasTable('app', 'orders')).toBe(false);
    });

    it('resolves an unqualified name over several schemas and flags it', () => {
        const b = builder();
        b.addTable(table('users', 'app'));
        b.addTable(table('users', 'audit'));
        b.addTable(table('orders', 'app'));
        expect(b.resolves(undefined, 'Users')).toBe(true);
        expect(b.isAmbiguous(undefined, 'users')).toBe(true);
        expect(b.isAmbiguous('app', 'users')).toBe(false);
        expect(b.isAmbiguous(undefined, 'orders')).toBe(false);
        expect(b.resolves('audit', 'orders')).toBe(false);
        expect(b.resolves(undefined, 'missing')).toBe(false);
    });

    it('stays fast with tens of thousands of tables', () => {
        const b = builder();
        const start = Date.now();
        for (let i = 0; i < 20000; i++) {
            b.addTable(table(`t${i}`));
            b.hasTable(undefined, `t${i}`);
            b.resolves(undefined, `t${i}`);
        }
        expect(Date.now() - start).toBeLessThan(5000);
    });
});

describe('DesignBuilder diagnostics', () => {
    it('names a table and a field that was dropped for repeating a name', () => {
        const b = builder();
        b.addTable({
            name: 'users',
            columns: [
                { name: 'id', typeName: 'int', nullable: false },
                { name: 'id', typeName: 'text', nullable: true },
                { name: 'email', typeName: 'text', nullable: true },
            ],
            indexes: [],
            checks: [],
        });
        const design = b.build();
        expect(design.entities.order).toHaveLength(1);
        expect(
            design.entities.byId[design.entities.order[0]].columnIds
        ).toHaveLength(2);
        expect(b.diagnostics.map((d) => d.message)).toEqual([
            'Table users: a second field named id was left out.',
        ]);
    });

    it('says when a many-to-many relationship became one-to-many', () => {
        const b = builder();
        for (const name of ['a', 'b'])
            b.addTable({
                name,
                columns: [{ name: 'id', typeName: 'int', nullable: false }],
                indexes: [],
                checks: [],
            });
        b.addLink({
            name: 'a_b',
            cardinality: { source: 'many', target: 'many' },
            from: { table: 'a', column: 'id' },
            to: { table: 'b', column: 'id' },
        });
        const design = b.build();
        const link = design.links.byId[design.links.order[0]];
        expect([link.sourceCardinality, link.targetCardinality]).toEqual([
            'one',
            'many',
        ]);
        expect(b.diagnostics.map((d) => d.message)).toEqual([
            'Relationship a_b: many-to-many is not supported, so it became one-to-many.',
        ]);
    });
});
