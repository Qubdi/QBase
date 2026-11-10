import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { assertReadOnlySql } from '../src/introspect/readonly-guard.js';
import {
    SQLSERVER_QUERIES,
    schemasParam,
    buildFkDefs,
    buildPkDefs,
    mssqlColumnShape,
    pinnedConnector,
    isPrivilegedRow,
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

describe('schema filter', () => {
    it('binds every schema as an element of a JSON array, so a comma in a name is kept', () => {
        expect(schemasParam([])).toBe('');
        expect(schemasParam(['dbo'])).toBe('["dbo"]');
        expect(JSON.parse(schemasParam(['sales,eu', 'a"b', 'dbo']))).toEqual(['sales,eu', 'a"b', 'dbo']);
    });

    it('reads that array in every catalog query that filters by schema', () => {
        const filtered = Object.values(SQLSERVER_QUERIES).filter((q) => q.includes('@schemas'));
        expect(filtered.length).toBeGreaterThan(3);
        for (const q of filtered) {
            expect(q).toContain('OPENJSON(@schemas)');
            expect(q).not.toContain('STRING_SPLIT');
        }
    });
});

describe('pinnedConnector', () => {
    const open: net.Server[] = [];
    const sockets: net.Socket[] = [];
    afterEach(() => {
        sockets.splice(0).forEach((s) => s.destroy());
        open.splice(0).forEach((s) => s.close());
    });

    const listen = async () => {
        const hits: string[] = [];
        const server = net.createServer((s) => hits.push(s.localAddress ?? ''));
        open.push(server);
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        return { port: (server.address() as net.AddressInfo).port, hits };
    };
    const signal = () => new AbortController().signal;

    it('dials the vetted address on the vetted port', async () => {
        const { port, hits } = await listen();
        const connect = pinnedConnector({ address: '127.0.0.1' }, port);
        const socket = await connect({ host: '127.0.0.1', port }, undefined, signal());
        sockets.push(socket);
        await new Promise((r) => setTimeout(r, 50));
        expect(hits).toEqual(['127.0.0.1']);
    });

    it('refuses another port or host, which is what a redirect asks for, without dialling', async () => {
        const vetted = await listen();
        const other = await listen();
        const connect = pinnedConnector({ address: '127.0.0.1' }, vetted.port);
        await expect(
            connect({ host: '127.0.0.1', port: other.port }, undefined, signal())
        ).rejects.toThrow(/redirect/);
        await expect(
            connect({ host: '127.0.0.2', port: vetted.port }, undefined, signal())
        ).rejects.toThrow(/redirect/);
        await new Promise((r) => setTimeout(r, 50));
        expect(vetted.hits).toEqual([]);
        expect(other.hits).toEqual([]);
    });

    it('fails when the connection is refused, and when already aborted', async () => {
        const { port } = await listen();
        open.pop()!.close();
        await new Promise((r) => setTimeout(r, 20));
        const connect = pinnedConnector({ address: '127.0.0.1' }, port);
        await expect(
            connect({ host: '127.0.0.1', port }, undefined, signal())
        ).rejects.toThrow(/ECONNREFUSED/);
        const stop = new AbortController();
        stop.abort(new Error('timed out'));
        await expect(
            connect({ host: '127.0.0.1', port }, undefined, stop.signal)
        ).rejects.toThrow('timed out');
    });
});

describe('SQL Server metadata: checks, computed columns, index predicates (fake pool)', () => {
    const rows: Record<keyof typeof SQLSERVER_QUERIES, object[]> = {
        server: [{ database_name: 'shop', version: 'Microsoft SQL Server 2022\n(X64)' }],
        privileges: [],
        tables: [{ schema: 'dbo', table: 'people', type: 'BASE TABLE', rows: 3 }],
        views: [],
        columns: [
            { schema: 'dbo', table: 'people', name: 'first', type: 'nvarchar', max_length: 40, precision: 0, scale: 0, ordinal_position: 1, nullable: false },
            { schema: 'dbo', table: 'people', name: 'upper_first', type: 'nvarchar', max_length: 40, precision: 0, scale: 0, ordinal_position: 2, nullable: true, generated_expression: '(upper([first]))', generated_stored: true },
            { schema: 'dbo', table: 'people', name: 'age', type: 'int', max_length: 4, precision: 10, scale: 0, ordinal_position: 3, nullable: true, generated_expression: null, generated_stored: null },
            // an alias type over nvarchar(40): the query answers the base type and the alias as domain
            { schema: 'dbo', table: 'people', name: 'nick', type: 'nvarchar', domain: 'nickname', collation: 'Latin1_General_CS_AS', max_length: 40, precision: 0, scale: 0, ordinal_position: 4, nullable: true },
        ],
        primaryKeys: [],
        foreignKeys: [],
        indexes: [
            { schema: 'dbo', table: 'people', name: 'ix_age', column: 'age', index_type: 'NONCLUSTERED', unique: false, primary: false, where: '([age] IS NOT NULL)', direction: 'DESC', column_position: 1 },
            { schema: 'dbo', table: 'people', name: 'ix_first', column: 'first', index_type: 'NONCLUSTERED', unique: true, primary: true, where: null, direction: 'ASC', column_position: 1 },
        ],
        checks: [{ schema: 'dbo', table: 'people', expression: '([age]>=(0))' }],
    };
    const pool = {
        request: () => ({
            input: () => undefined,
            query: async (text: string) => {
                const key = (Object.keys(SQLSERVER_QUERIES) as (keyof typeof SQLSERVER_QUERIES)[]).find(
                    (k) => SQLSERVER_QUERIES[k] === text
                )!;
                return { recordset: rows[key] };
            },
        }),
        close: async () => undefined,
    };

    it('lists check constraints, computed columns and filter predicates', async () => {
        const { SqlServerIntrospector } = await import('../src/introspect/sqlserver.js');
        const meta = await new SqlServerIntrospector(pool as never).introspect({ schemas: [] });
        expect(meta.check_constraints).toEqual([{ schema: 'dbo', table: 'people', expression: '([age]>=(0))' }]);
        expect(meta.custom_types).toEqual([]);
        expect(meta.columns.map((c) => c.generated)).toEqual([
            null,
            { expression: '(upper([first]))', stored: true },
            null,
            null,
        ]);
        expect(meta.indexes.map((i) => [i.direction, i.where])).toEqual([
            ['DESC', '([age] IS NOT NULL)'],
            ['ASC', null],
        ]);
        // CLI-039: the catalog's is_primary_key travels as `primary`
        expect(meta.indexes.map((i) => i.primary)).toEqual([false, true]);
    });

    it('DB-006: an alias type arrives as its base type plus the alias as domain, sized like the base', async () => {
        const { SqlServerIntrospector } = await import('../src/introspect/sqlserver.js');
        const meta = await new SqlServerIntrospector(pool as never).introspect({ schemas: [] });
        const nick = meta.columns.find((c) => c.name === 'nick')!;
        expect([nick.type, nick.domain, nick.character_maximum_length]).toEqual(['nvarchar', 'nickname', '20']);
        // a column of a plain type has no domain
        expect(meta.columns.filter((c) => c.name !== 'nick').every((c) => c.domain === null)).toBe(true);
    });

    it('DB-019: the collation is whatever the query answers, and the query answers NULL for the database default', async () => {
        const { SqlServerIntrospector } = await import('../src/introspect/sqlserver.js');
        const meta = await new SqlServerIntrospector(pool as never).introspect({ schemas: [] });
        expect(meta.columns.map((c) => c.collation)).toEqual([null, null, null, 'Latin1_General_CS_AS']);
        const q = SQLSERVER_QUERIES.columns;
        expect(q).toContain("DATABASEPROPERTYEX(DB_NAME(), 'Collation')");
        expect(q).toMatch(/THEN NULL ELSE c\.collation_name END AS collation/);
    });

    it('DB-004: columnstore, XML and spatial indexes are listed with every column, in their own order', () => {
        const q = SQLSERVER_QUERIES.indexes;
        expect(q).toContain('i.type IN (3, 4, 5, 6)');
        // key indexes still read key columns only
        expect(q).toContain('ic.is_included_column = 0 AND ic.key_ordinal > 0');
        expect(q).toContain('ic.index_column_id');
        expect(q).toContain('i.type_desc AS index_type');
    });

    it('the queries ask the catalog for them', () => {
        expect(SQLSERVER_QUERIES.checks).toContain('sys.check_constraints');
        expect(SQLSERVER_QUERIES.columns).toContain('sys.computed_columns');
        expect(SQLSERVER_QUERIES.indexes).toContain('filter_definition');
        expect(SQLSERVER_QUERIES.indexes).toContain('is_descending_key');
        expect(SQLSERVER_QUERIES.indexes).toContain('i.is_primary_key AS [primary]');
    });
});

describe('SQL Server login privileges', () => {
    it('refuses a sysadmin or a db_owner and accepts a plain login', () => {
        expect(isPrivilegedRow({ is_sysadmin: 1, is_db_owner: 0 })).toBe(true);
        expect(isPrivilegedRow({ is_sysadmin: 0, is_db_owner: 1 })).toBe(true);
        expect(isPrivilegedRow({ is_sysadmin: 0, is_db_owner: 0 })).toBe(false);
        // NULL is what the functions answer for a role that does not exist
        expect(isPrivilegedRow({ is_sysadmin: null, is_db_owner: null })).toBe(false);
        expect(isPrivilegedRow(undefined)).toBe(false);
    });

    it('reads both roles with one registered query', () => {
        expect(SQLSERVER_QUERIES.privileges).toMatch(/IS_SRVROLEMEMBER\('sysadmin'\)/);
        expect(SQLSERVER_QUERIES.privileges).toMatch(/IS_MEMBER\('db_owner'\)/);
    });
});
