import { describe, expect, it } from 'vitest';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import { DesignBuilder } from '@/formats/shared/design-builder';
import type { ColumnSpec, TableSpec } from '@/formats/shared/design-builder';
import { exportSql } from '@/formats/sql/export-sql';
import type { DatabaseType } from '@/core/model/database';

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const col = (
    name: string,
    typeName: string,
    o: Partial<ColumnSpec> = {}
): ColumnSpec => ({ name, typeName, nullable: true, ...o });

function build(type: DatabaseType, tables: TableSpec[]): Design {
    const b = new DesignBuilder({
        databaseType: type,
        name: 'p8',
        now: NOW,
        random: seededRandom(11),
        sort: false,
    });
    for (const t of tables) b.addTable(t);
    return b.build();
}
const one = (
    type: DatabaseType,
    columns: ColumnSpec[],
    t: Partial<TableSpec> = {}
) => build(type, [{ name: 't', columns, indexes: [], checks: [], ...t }]);

describe('EXP-029 SQL Server index column limit', () => {
    it('writes 32 columns and says the 33rd was cut', () => {
        const cols = Array.from({ length: 33 }, (_, i) =>
            col(`c${i + 1}`, 'int')
        );
        const d = one('sql_server', cols, {
            indexes: [
                {
                    name: 'wide',
                    unique: false,
                    columns: cols.map((c) => c.name),
                },
            ],
        });
        const text = exportSql(d, 'sql_server').text;
        expect(text).toContain(
            '/* WARNING: This index originally had 33 columns. It has been truncated to 32 columns'
        );
        const line = text
            .split('\n')
            .find((l) => l.startsWith('CREATE INDEX'))!;
        expect(line.match(/\[c\d+\]/g)).toHaveLength(32);
        expect(line).not.toContain('[c33]');
    });
    it('an index of 32 columns has no warning', () => {
        const cols = Array.from({ length: 32 }, (_, i) =>
            col(`c${i + 1}`, 'int')
        );
        const d = one('sql_server', cols, {
            indexes: [
                {
                    name: 'wide',
                    unique: false,
                    columns: cols.map((c) => c.name),
                },
            ],
        });
        expect(exportSql(d, 'sql_server').text).not.toContain('WARNING');
    });
});

describe('EXP-038 unsigned integers, decimals and long text in keys', () => {
    const mysql = one('mysql', [
        col('a', 'tinyint unsigned'),
        col('b', 'smallint unsigned'),
        col('c', 'int unsigned'),
        col('d', 'bigint unsigned'),
        col('e', 'decimal', { precision: 70, scale: 40 }),
        col('f', 'decimal'),
    ]);
    it('PostgreSQL: unsigned moves up one size, 64 bit becomes numeric(20, 0)', () => {
        const text = exportSql(mysql, 'postgresql').text;
        expect(text).toContain('"a" smallint');
        expect(text).toContain('"b" integer');
        expect(text).toContain('"c" bigint');
        expect(text).toContain('"d" numeric(20, 0)');
    });
    it('SQL Server: unsigned sizes, decimals clamp to 38 with notes, no precision gives (38, 10)', () => {
        const text = exportSql(mysql, 'sql_server').text;
        expect(text).toContain('[a] TINYINT');
        expect(text).toContain('[b] INT');
        expect(text).toContain('[c] BIGINT');
        expect(text).toContain('[d] DECIMAL(20, 0)');
        expect(text).toContain('[e] DECIMAL(38, 38)');
        expect(text).toContain('[f] DECIMAL(38, 10)');
        expect(text).toContain('t.e: precision 70 reduced to 38');
        expect(text).toContain('t.e: scale 40 reduced to 38');
    });
    it('SQLite: every integer is INTEGER', () => {
        const text = exportSql(mysql, 'sqlite').text;
        for (const n of ['a', 'b', 'c', 'd'])
            expect(text).toContain(`"${n}" INTEGER`);
    });
    it('long text shortens only when the column is part of a key', () => {
        const d = one('postgresql', [
            col('k', 'text', { unique: true }),
            col('v', 'varchar', { length: 5000, unique: true }),
            col('free', 'text'),
        ]);
        const my = exportSql(d, 'mysql').text;
        expect(my).toContain('`k` VARCHAR(768) UNIQUE');
        expect(my).toContain('`v` VARCHAR(768) UNIQUE');
        expect(my).toContain('`free` TEXT');
        expect(my).toContain('t.v: shortened from 5000 to 768 characters');
        const ms = exportSql(d, 'sql_server').text;
        expect(ms).toContain('[k] NVARCHAR(450)');
        expect(ms).toContain('[v] VARCHAR(900)');
        expect(ms).toContain('[free] NVARCHAR(MAX)');
    });
});
