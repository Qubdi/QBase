import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import {
    asStringLiteral as plainStringLiteral,
    isFunctionCall,
    isKeywordDefault,
    isKnownForm,
    isNumberText,
    isNumberingMarker,
    isQuotedText,
} from '../shared/defaults';
import type { ExportForeignKey, ExportTable } from '../shared/export-model';
import {
    indexKeys,
    prepareExport,
    sortedStatements,
} from '../shared/export-model';
import {
    claimName,
    commaList,
    firstSeen,
    linesOf,
    qualify,
    quoteBacktick,
    scopes,
    toIdentifier,
} from '../shared/text';

/** MySQL reads a backslash in a string as an escape, so it is doubled too. */
export function asStringLiteral(text: string): string {
    return plainStringLiteral(text.replace(/\\/g, '\\\\'));
}

const DIRECT: Record<string, string> = {
    int: 'INT',
    integer: 'INT',
    smallint: 'SMALLINT',
    bigint: 'BIGINT',
    decimal: 'DECIMAL',
    numeric: 'DECIMAL',
    float: 'FLOAT',
    double: 'DOUBLE',
    real: 'DOUBLE',
    char: 'CHAR',
    character: 'CHAR',
    varchar: 'VARCHAR',
    'character varying': 'VARCHAR',
    nvarchar: 'VARCHAR',
    text: 'TEXT',
    ntext: 'TEXT',
    longtext: 'LONGTEXT',
    mediumtext: 'MEDIUMTEXT',
    tinytext: 'TINYTEXT',
    date: 'DATE',
    datetime: 'DATETIME',
    timestamp: 'DATETIME',
    datetime2: 'DATETIME',
    time: 'TIME',
    blob: 'BLOB',
    binary: 'BLOB',
    varbinary: 'VARBINARY',
    bit: 'BIT',
    boolean: 'TINYINT(1)',
    bool: 'TINYINT(1)',
    enum: 'VARCHAR(50)',
    set: 'VARCHAR(255)',
    json: 'JSON',
    jsonb: 'JSON',
    uuid: 'CHAR(36)',
    geometry: 'GEOMETRY',
    geography: 'GEOMETRY',
    array: 'JSON',
    'user-defined': 'JSON',
};

const TEXTUAL_FOR_INDEX = new Set(['text', 'mediumtext', 'longtext', 'blob']);

/** The MySQL spelling of a stored column type, with its arguments. */
export function mysqlType(column: Column): string {
    const raw = column.type.name;
    const lower = raw.toLowerCase();
    if (column.isArray || lower.endsWith('[]')) return 'JSON';
    const base = DIRECT[lower] ?? raw;
    if (base === 'VARCHAR' || base === 'CHAR' || base === 'VARBINARY') {
        if (typeof column.length === 'number')
            return `${base}(${column.length})`;
        if (base === 'VARCHAR') return 'VARCHAR(255)';
        return base;
    }
    if (base === 'DECIMAL' && column.precision !== undefined)
        return column.scale !== undefined
            ? `DECIMAL(${column.precision}, ${column.scale})`
            : `DECIMAL(${column.precision})`;
    return base;
}

export function mysqlDefault(raw: string): string {
    const text = raw.trim();
    if (/^(?:now\(\)|current_timestamp)$/i.test(text))
        return 'CURRENT_TIMESTAMP';
    if (/^(?:newid\(\)|uuid\(\))$/i.test(text)) return 'UUID()';
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

function columnLine(column: Column): string {
    const notes = column.comments
        ? linesOf(column.comments)
              .map((l) => `    -- ${l}\n`)
              .join('')
        : '';
    const text = column.default?.trim() ?? '';
    const numbered =
        column.increment || (column.primaryKey && isNumberingMarker(text));
    let line = `${quoteBacktick(column.name)} ${mysqlType(column)}`;
    if (!column.nullable) line += ' NOT NULL';
    if (numbered) line += ' AUTO_INCREMENT';
    if (!column.primaryKey && column.unique) line += ' UNIQUE';
    if (!numbered && text !== '' && !isNumberingMarker(text))
        line += ` DEFAULT ${mysqlDefault(text)}`;
    if (column.comments)
        line += ` COMMENT ${asStringLiteral(column.comments.replace(/\s+/g, ' ').trim())}`;
    return `${notes}    ${line}`;
}

function indexStatements(table: ExportTable, qualified: string): string[] {
    const { entity } = table;
    // index names are unique per table
    const usedNames = new Set<string>();
    const out = indexKeys(table, { byColumns: true }).map(
        ({ key, columns }) => {
            const name = claimName(
                usedNames,
                `idx_${entity.name}_${columns.map((c) => c.name).join('_')}${
                    key.distinct ? '_unique' : ''
                }`,
                64
            );
            const cols = columns.map((c) => {
                const quoted = quoteBacktick(c.name);
                return TEXTUAL_FOR_INDEX.has(c.type.name.toLowerCase())
                    ? `${quoted}(255)`
                    : quoted;
            });
            return `CREATE ${key.distinct ? 'UNIQUE ' : ''}INDEX ${quoteBacktick(
                name
            )} ON ${qualified} (${commaList(cols)});`;
        }
    );
    return sortedStatements(out);
}

function tableText(table: ExportTable): string {
    const { entity } = table;
    const qualified = qualify(quoteBacktick, entity.schema, entity.name);
    const parts = table.columns.map(columnLine);
    if (table.primary.length > 0)
        parts.push(
            `    PRIMARY KEY (${commaList(
                table.primary.map((c) => quoteBacktick(c.name))
            )})`
        );
    for (const rule of table.rules)
        if (rule.expression.trim())
            parts.push(`    CHECK (${rule.expression})`);

    const notes = entity.comments
        ? linesOf(entity.comments)
              .map((l) => `-- ${l}\n`)
              .join('')
        : '';
    let text = `${notes}\nCREATE TABLE IF NOT EXISTS ${qualified} (\n${parts.join(',\n')}\n)`;
    if (entity.comments)
        text += ` COMMENT=${asStringLiteral(entity.comments.replace(/\s+/g, ' ').trim())}`;
    text += ';\n';
    const indexes = indexStatements(table, qualified);
    if (indexes.length > 0) text += `\n-- Indexes\n${indexes.join('\n')}`;
    return `${text}\n`;
}

function foreignKeyStatement(
    fk: ExportForeignKey,
    used: (key: string) => Set<string>
): string {
    // constraint names are unique per database
    const name = claimName(
        used(fk.holder.schema ?? ''),
        toIdentifier(
            `fk_${fk.holder.name}_${fk.columns.map((c) => c.name).join('_')}`
        ),
        64
    );
    return `ALTER TABLE ${qualify(
        quoteBacktick,
        fk.holder.schema,
        fk.holder.name
    )} ADD CONSTRAINT ${quoteBacktick(name)} FOREIGN KEY(${commaList(
        fk.columns.map((c) => quoteBacktick(c.name))
    )}) REFERENCES ${qualify(
        quoteBacktick,
        fk.referenced.schema,
        fk.referenced.name
    )}(${commaList(fk.referencedColumns.map((c) => quoteBacktick(c.name)))});`;
}

/** MySQL (and MariaDB) script for a design (EXP-020 to EXP-025). */
export function writeMysql(design: Design): string {
    const model = prepareExport(design);
    if (model.tables.length === 0) return '';
    const schemas = firstSeen(
        model.tables.map((t) => t.entity.schema).filter((s): s is string => !!s)
    );
    let out = '-- MySQL database export\nSTART TRANSACTION;\n';
    if (schemas.length > 0)
        out += `${schemas
            .map((s) => `CREATE DATABASE IF NOT EXISTS ${quoteBacktick(s)};`)
            .join('\n')}\n\n`;
    out += model.tables.map(tableText).join('\n');
    if (model.foreignKeys.length > 0) {
        const used = scopes();
        out += `\n-- Foreign key constraints\n${model.foreignKeys
            .map((fk) => foreignKeyStatement(fk, used))
            .join('\n')}`;
    }
    return `${out}\n\nCOMMIT;\n`;
}
