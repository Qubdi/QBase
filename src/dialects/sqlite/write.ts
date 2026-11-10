import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import {
    asStringLiteral,
    isFunctionCall,
    isKeywordDefault,
    isKnownForm,
    isNumberText,
    isNumberingMarker,
    isQuotedText,
} from '../shared/defaults';
import type { ExportForeignKey, ExportTable } from '../shared/export-model';
import {
    foreignKeysHeldBy,
    indexColumnText,
    indexKeys,
    prepareExport,
    sortedStatements,
} from '../shared/export-model';
import {
    claimName,
    collateClause,
    commaList,
    linesOf,
    oneLine,
    quoteDouble,
    toIdentifier,
} from '../shared/text';

const SYSTEM_TABLES = new Set([
    'sqlite_sequence',
    'sqlite_stat1',
    'sqlite_stat2',
    'sqlite_stat3',
    'sqlite_stat4',
    'sqlite_master',
]);

const SAME_NAME_UPPER = new Set([
    'integer',
    'text',
    'real',
    'blob',
    'numeric',
    'decimal',
    'boolean',
    'date',
    'datetime',
    'timestamp',
    'float',
    'double',
    'varchar',
    'char',
    'int',
    'smallint',
    'tinyint',
    'bigint',
    'json',
]);

const RENAMED: Record<string, string> = {
    nchar: 'TEXT',
    nvarchar: 'TEXT',
    ntext: 'TEXT',
    'character varying': 'TEXT',
    character: 'TEXT',
    datetime2: 'DATETIME',
    binary: 'BLOB',
    varbinary: 'BLOB',
    image: 'BLOB',
    geometry: 'BLOB',
    geography: 'BLOB',
    bit: 'BOOLEAN',
    'user-defined': 'TEXT',
    jsonb: 'TEXT',
    array: 'TEXT',
    mediumint: 'INTEGER',
};

/** The SQLite affinity name for a column, with arguments. */
export function sqliteType(column: Column): string {
    const lower = column.type.name.toLowerCase();
    let base: string;
    if (column.primaryKey && (lower === 'int' || lower === 'integer'))
        base = 'INTEGER';
    else if (lower.endsWith('[]') || column.isArray) base = 'TEXT';
    else if (SAME_NAME_UPPER.has(lower)) base = lower.toUpperCase();
    else base = RENAMED[lower] ?? column.type.name.toUpperCase();

    if (
        (base === 'VARCHAR' || base === 'CHAR' || base === 'TEXT') &&
        typeof column.length === 'number'
    )
        return `${base}(${column.length})`;
    if (
        ['DECIMAL', 'NUMERIC', 'REAL', 'FLOAT', 'DOUBLE'].includes(base) &&
        column.precision !== undefined
    )
        return column.scale !== undefined
            ? `${base}(${column.precision}, ${column.scale})`
            : `${base}(${column.precision})`;
    return base;
}

export function sqliteDefault(raw: string): string {
    const text = raw.trim();
    if (/^(?:now\(\)|current_timestamp)$/i.test(text))
        return 'CURRENT_TIMESTAMP';
    if (/^(?:newid\(\)|uuid\(\))$/i.test(text))
        return 'lower(hex(randomblob(16)))';
    if (/datetime\(\s*'?'?now'?'?\s*\)/i.test(text)) return 'CURRENT_TIMESTAMP';
    if (
        isKnownForm(text) ||
        isFunctionCall(text) ||
        isKeywordDefault(text) ||
        isNumberText(text) ||
        isQuotedText(text)
    )
        return text;
    return asStringLiteral(text);
}

function columnLine(column: Column, inlineKey: Column | undefined): string {
    const notes = column.comments
        ? linesOf(column.comments)
              .map((l) => `    -- ${l}\n`)
              .join('')
        : '';
    const text = column.default?.trim() ?? '';
    let line = `${quoteDouble(column.name)} ${sqliteType(column)}`;
    line += collateClause(column.collation);
    if (inlineKey === column) {
        line += ' PRIMARY KEY';
        if (column.increment || isNumberingMarker(text))
            line += ' AUTOINCREMENT';
    }
    if (!column.nullable) line += ' NOT NULL';
    if (!column.primaryKey && column.unique) line += ' UNIQUE';
    if (column.generated) {
        line += ` GENERATED ALWAYS AS (${column.generated.expression}) ${
            column.generated.stored ? 'STORED' : 'VIRTUAL'
        }`;
        return `${notes}    ${line}`;
    }
    if (text !== '' && !isNumberingMarker(text))
        line += ` DEFAULT ${sqliteDefault(text)}`;
    return `${notes}    ${line}`;
}

function indexStatements(
    table: ExportTable,
    used: Set<string>,
    tableName: string
): string[] {
    const out = indexKeys(table, { byColumns: true }).map(
        ({ key, columns }) => {
            // index names are unique per database: a clash gets a suffix
            const name = claimName(
                used,
                toIdentifier(
                    key.label.startsWith(`${tableName}_`)
                        ? key.label
                        : `${tableName}_${key.label}`
                ),
                60
            );
            return `CREATE ${key.distinct ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quoteDouble(
                name
            )}\nON ${quoteDouble(tableName)} (${commaList(
                columns.map((c) => indexColumnText(key, c, quoteDouble))
            )})${key.where ? ` WHERE ${key.where}` : ''};`;
        }
    );
    return sortedStatements(out);
}

function foreignKeyLine(
    fk: ExportForeignKey,
    names: Map<string, string>
): string {
    return `    FOREIGN KEY(${commaList(
        fk.columns.map((c) => quoteDouble(c.name))
    )}) REFERENCES ${quoteDouble(
        names.get(fk.referenced.id) ?? fk.referenced.name
    )}(${commaList(fk.referencedColumns.map((c) => quoteDouble(c.name)))})`;
}

function tableText(
    table: ExportTable,
    held: ExportForeignKey[],
    usedIndexNames: Set<string>,
    names: Map<string, string>
): string {
    const { entity } = table;
    const tableName = names.get(entity.id) ?? entity.name;
    if (SYSTEM_TABLES.has(entity.name.toLowerCase()))
        return `-- Skipping SQLite system table: ${oneLine(quoteDouble(entity.name))}\n`;
    const single =
        table.primary.length === 1 &&
        ['int', 'integer'].includes(table.primary[0].type.name.toLowerCase())
            ? table.primary[0]
            : undefined;
    const parts = table.columns.map((c) => columnLine(c, single));
    if (table.primary.length > 0 && !single)
        parts.push(
            `    PRIMARY KEY (${commaList(
                table.primary.map((c) => quoteDouble(c.name))
            )})`
        );
    for (const rule of table.rules)
        if (rule.expression.trim())
            parts.push(`    CHECK (${rule.expression})`);
    for (const fk of held) parts.push(foreignKeyLine(fk, names));

    let head = '';
    if (entity.schema)
        head += `-- Original schema: ${oneLine(entity.schema)}\n`;
    if (entity.comments)
        head += linesOf(entity.comments)
            .map((l) => `-- ${l}\n`)
            .join('');
    let text = `${head}CREATE TABLE IF NOT EXISTS ${quoteDouble(
        tableName
    )} (\n${parts.join(',\n')}\n);\n`;
    const indexes = indexStatements(table, usedIndexNames, tableName);
    if (indexes.length > 0) text += `\n-- Indexes\n${indexes.join('\n')}`;
    return `${text}\n`;
}

/**
 * SQLite has no schemas, so tables of different schemas that share a name
 * would collapse into one (`IF NOT EXISTS` skips the second): such tables are
 * written as `<schema>_<name>`, and a still-clashing name gets a suffix.
 */
function tableNames(tables: ExportTable[]): Map<string, string> {
    const count = new Map<string, number>();
    for (const t of tables) {
        const key = t.entity.name.toLowerCase();
        count.set(key, (count.get(key) ?? 0) + 1);
    }
    const used = new Set<string>();
    const names = new Map<string, string>();
    for (const t of tables) {
        const { name, schema } = t.entity;
        const clash = (count.get(name.toLowerCase()) ?? 0) > 1;
        names.set(
            t.entity.id,
            claimName(used, clash && schema ? `${schema}_${name}` : name)
        );
    }
    return names;
}

/** SQLite script for a design (EXP-032 to EXP-036). */
export function writeSqlite(design: Design): string {
    const model = prepareExport(design);
    if (model.tables.length === 0) return '';
    let out = '-- SQLite database export\n';
    if (model.linkCount > 0) out += 'PRAGMA foreign_keys = ON;\n\n';
    out += 'BEGIN TRANSACTION;\n';
    const usedIndexNames = new Set<string>();
    const names = tableNames(model.tables);
    out += model.tables
        .map((t) =>
            tableText(
                t,
                foreignKeysHeldBy(model, t.entity),
                usedIndexNames,
                names
            )
        )
        .join('\n');
    return `${out}\nCOMMIT;\n`;
}
