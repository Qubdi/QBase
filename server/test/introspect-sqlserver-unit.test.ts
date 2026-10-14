import { describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '../src/introspect/readonly-guard.js';
import {
    SQLSERVER_QUERIES,
    buildFkDefs,
    buildPkDefs,
    mssqlColumnShape,
} from '../src/introspect/sqlserver.js';

describe('mssqlColumnShape', () => {
    it('halves byte lengths for unicode types and keeps MAX readable', () => {
        expect(mssqlColumnShape('nvarchar', 240, 0, 0).characterMaximumLength).toBe('120');
        expect(mssqlColumnShape('nchar', 20, 0, 0).characterMaximumLength).toBe('10');
        expect(mssqlColumnShape('nvarchar', -1, 0, 0).characterMaximumLength).toBe('max');
        expect(mssqlColumnShape('varchar', -1, 0, 0).characterMaximumLength).toBe('max');
    });

    it('uses byte length as-is for single-byte and binary types', () => {
        expect(mssqlColumnShape('varchar', 40, 0, 0).characterMaximumLength).toBe('40');
        expect(mssqlColumnShape('char', 8, 0, 0).characterMaximumLength).toBe('8');
        expect(mssqlColumnShape('varbinary', 16, 0, 0).characterMaximumLength).toBe('16');
    });

    it('reports precision and scale for exact numerics', () => {
        expect(mssqlColumnShape('decimal', 9, 10, 2).precision).toEqual({ precision: 10, scale: 2 });
        expect(mssqlColumnShape('numeric', 5, 5, 0).precision).toEqual({ precision: 5, scale: 0 });
    });

    it('treats scale as fractional-second precision for date/time types', () => {
        expect(mssqlColumnShape('datetime2', 8, 27, 3).precision).toEqual({ precision: 3, scale: null });
        expect(mssqlColumnShape('time', 5, 16, 7).precision).toEqual({ precision: 7, scale: null });
        expect(mssqlColumnShape('datetimeoffset', 10, 34, 7).precision).toEqual({ precision: 7, scale: null });
    });

    it('ignores types where length and precision are fixed', () => {
        expect(mssqlColumnShape('int', 4, 10, 0)).toEqual({ characterMaximumLength: null, precision: null });
        expect(mssqlColumnShape('bit', 1, 1, 0)).toEqual({ characterMaximumLength: null, precision: null });
        expect(mssqlColumnShape('INT', 4, 10, 0).precision).toBeNull();
    });
});

describe('buildPkDefs', () => {
    it('orders composite key columns and writes one definition per table', () => {
        const out = buildPkDefs([
            { schema: 's', table: 't', column: 'b', ord: 2 },
            { schema: 's', table: 't', column: 'a', ord: 1 },
            { schema: 's', table: 'u', column: 'id', ord: 1 },
        ]);
        expect(out.filter((p) => p.table === 't').map((p) => p.column)).toEqual(['a', 'b']);
        expect(out.find((p) => p.table === 't')?.pk_def).toBe('PRIMARY KEY (a, b)');
        expect(out.find((p) => p.table === 'u')?.pk_def).toBe('PRIMARY KEY (id)');
    });

    it('handles no keys', () => {
        expect(buildPkDefs([])).toEqual([]);
    });
});

describe('buildFkDefs', () => {
    const row = (over: object) => ({
        schema: 'shop',
        table: 'orders',
        column: 'customer_id',
        foreign_key_name: 'fk1',
        reference_schema: 'dbo',
        reference_table: 'customers',
        reference_column: 'id',
        on_delete: 'CASCADE',
        on_update: 'NO_ACTION',
        ord: 1,
        ...over,
    });

    it('writes the definition with ON DELETE / ON UPDATE actions', () => {
        const [fk] = buildFkDefs([row({})]);
        expect(fk.fk_def).toBe(
            'FOREIGN KEY (customer_id) REFERENCES dbo.customers (id) ON DELETE CASCADE ON UPDATE NO ACTION'
        );
        expect(fk).toMatchObject({ foreign_key_name: 'fk1', reference_table: 'customers' });
    });

    it('turns underscores into spaces for SET_NULL / SET_DEFAULT', () => {
        expect(buildFkDefs([row({ on_delete: 'SET_NULL', on_update: 'SET_DEFAULT' })])[0].fk_def).toMatch(
            /ON DELETE SET NULL ON UPDATE SET DEFAULT$/
        );
    });

    it('groups multi-column keys in column order and repeats the definition', () => {
        const out = buildFkDefs([
            row({ column: 'b', reference_column: 'y', ord: 2 }),
            row({ column: 'a', reference_column: 'x', ord: 1 }),
        ]);
        expect(out.map((f) => f.column)).toEqual(['a', 'b']);
        expect(out[0].fk_def).toContain('FOREIGN KEY (a, b)');
        expect(out[0].fk_def).toContain('(x, y)');
        expect(out[1].fk_def).toBe(out[0].fk_def);
    });

    it('keeps different constraints on the same table apart', () => {
        const out = buildFkDefs([row({ foreign_key_name: 'f1' }), row({ foreign_key_name: 'f2', column: 'c' })]);
        expect(new Set(out.map((f) => f.fk_def)).size).toBe(2);
    });

    it('defaults a missing action to NO ACTION', () => {
        const [fk] = buildFkDefs([row({ on_delete: undefined, on_update: undefined })]);
        expect(fk.fk_def).toMatch(/ON DELETE NO ACTION ON UPDATE NO ACTION$/);
    });
});

describe('SQL Server catalog queries', () => {
    it('are all read-only', () => {
        for (const [name, sql] of Object.entries(SQLSERVER_QUERIES)) {
            expect(() => assertReadOnlySql(sql), name).not.toThrow();
        }
    });
});
