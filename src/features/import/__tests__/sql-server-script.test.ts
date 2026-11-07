import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import { rng } from '@/core/testing/helpers';
import { exportSql } from '@/formats/sql/export-sql';
import { importSql } from '@/formats/sql/import-sql';
import { loadFromDatabaseMetadata } from '@/formats/metadata/load';
import { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import { metadataScriptFor } from '../metadata-scripts';

// The SQL Server scripts were NOT run against a server here (no SQL Server
// container is started because of its EULA). They are checked by reading: the
// catalog views and columns they use, the JSON keys they emit, and a result
// written by hand in the shape FOR JSON PATH gives (nested "generated").

const standard = metadataScriptFor('sql_server')!;
const legacy = metadataScriptFor('sql_server', 'sql_server_2016_and_below')!;

describe('SQL Server client scripts: where and generated', () => {
    for (const [label, script] of [
        ['standard (FOR JSON)', standard],
        ['2016 and below (FOR XML)', legacy],
    ] as const) {
        it(`${label} reads the filter, the computed column and the sort direction`, () => {
            expect(script).toContain('i.filter_definition');
            expect(script).toContain(
                'LEFT JOIN sys.computed_columns cmp ON cmp.object_id = c.object_id AND cmp.column_id = c.column_id'
            );
            expect(script).toContain('cmp.definition');
            expect(script).toContain('cmp.is_persisted');
            expect(script).toContain('ic.is_descending_key');
            // the join feeding the computed columns comes before the SELECT list is read from it
            expect(script.indexOf('sys.computed_columns')).toBeGreaterThan(
                script.indexOf('sys.columns c')
            );
        });
    }

    it('FOR JSON names the keys of the contract (nested generated, where)', () => {
        expect(standard).toContain('[generated.expression]');
        expect(standard).toContain(
            'CAST(cmp.is_persisted AS bit) AS [generated.stored]'
        );
        expect(standard).toContain('i.filter_definition AS [where]');
    });

    it('the hand-built text writes the same keys and null for an ordinary column', () => {
        expect(legacy).toContain(`"generated":`);
        expect(legacy).toContain(`"where":`);
        expect(legacy).toContain(
            `CASE WHEN cmp.definition IS NULL THEN 'null' ELSE '{"expression":"'`
        );
        expect(legacy).toContain(`'","stored":'`);
        // quotes and parentheses balance (a stray one would break the batch)
        for (const text of [standard, legacy]) {
            expect((text.match(/\(/g) ?? []).length).toBe(
                (text.match(/\)/g) ?? []).length
            );
            expect((text.match(/'/g) ?? []).length % 2).toBe(0);
        }
    });
});

const RESULT = {
    database_name: 'shop',
    version: 'Microsoft SQL Server 2022',
    tables: [
        {
            schema: 'dbo',
            table: 'Orders',
            rows: 0,
            type: 'BASE TABLE',
            comment: null,
        },
    ],
    views: [],
    columns: [
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Id',
            type: 'int',
            ordinal_position: 1,
            nullable: false,
            is_identity: true,
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Net',
            type: 'decimal',
            ordinal_position: 2,
            nullable: false,
            precision: { precision: 10, scale: 2 },
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Tax',
            type: 'decimal',
            ordinal_position: 3,
            nullable: false,
            precision: { precision: 10, scale: 2 },
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Gross',
            type: 'decimal',
            ordinal_position: 4,
            nullable: true,
            precision: { precision: 11, scale: 2 },
            generated: { expression: '([Net]+[Tax])', stored: false },
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Label',
            type: 'varchar',
            ordinal_position: 5,
            nullable: false,
            character_maximum_length: '20',
            generated: {
                expression: '(CONVERT([varchar](20),[Id]))',
                stored: true,
            },
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'Deleted',
            type: 'datetime2',
            ordinal_position: 6,
            nullable: true,
        },
    ],
    pk_info: [
        { schema: 'dbo', table: 'Orders', column: 'Id', pk_def: 'PRIMARY KEY' },
    ],
    fk_info: [],
    indexes: [
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'PK_Orders',
            column: 'Id',
            index_type: 'clustered',
            unique: true,
            direction: 'asc',
            column_position: 1,
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'IX_Orders_Net',
            column: 'Net',
            index_type: 'nonclustered',
            unique: false,
            direction: 'desc',
            column_position: 1,
            where: '([Deleted] IS NULL)',
        },
        {
            schema: 'dbo',
            table: 'Orders',
            name: 'IX_Orders_Net',
            column: 'Tax',
            index_type: 'nonclustered',
            unique: false,
            direction: 'asc',
            column_position: 2,
            where: '([Deleted] IS NULL)',
        },
    ],
    check_constraints: [],
};

describe('SQL Server result with where and generated', () => {
    const load = () =>
        loadFromDatabaseMetadata({
            databaseType: 'sql_server',
            databaseMetadata: DatabaseMetadata.parse(RESULT),
            now: 1,
            random: rng(),
        });

    it('loads the predicate, the direction and the computed columns', () => {
        const { design } = load();
        const e = listOf(design.entities)[0];
        const cols = e.columnIds.map((id) => design.columns[id]);
        const byName = (n: string) => cols.find((c) => c.name === n)!;
        expect(byName('Gross').generated).toEqual({
            expression: '([Net]+[Tax])',
            stored: false,
        });
        expect(byName('Label').generated?.stored).toBe(true);
        expect(byName('Net').generated).toBeUndefined();
        const key = e.keyIds
            .map((id) => design.keys[id])
            .find((k) => k.label === 'IX_Orders_Net')!;
        expect(key.where).toBe('([Deleted] IS NULL)');
        expect(key.descending).toEqual([byName('Net').id]);
        expect(key.algorithm).toBe('nonclustered');
    });

    it('writes them back as SQL Server and reads the script back to the same keys and expressions', () => {
        const { design } = load();
        const text = exportSql(design, 'sql_server').text;
        expect(text).toContain('[Gross] AS (([Net]+[Tax]))');
        expect(text).toContain(
            '[Label] AS ((CONVERT([varchar](20),[Id]))) PERSISTED NOT NULL'
        );
        expect(text).toContain(
            '([Net] DESC, [Tax]) WHERE ([Deleted] IS NULL);'
        );
        const back = importSql(text, 'sql_server').design!;
        const e = listOf(back.entities)[0];
        const key = e.keyIds
            .map((id) => back.keys[id])
            .find((k) => k.label.endsWith('IX_Orders_Net'))!;
        expect(key.where).toBe('([Deleted] IS NULL)');
        expect(key.descending).toHaveLength(1);
        const gross = e.columnIds
            .map((id) => back.columns[id])
            .find((c) => c.name === 'Gross')!;
        expect(gross.generated).toEqual({
            expression: '([Net]+[Tax])',
            stored: false,
        });
    });
});
