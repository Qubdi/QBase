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
    unwrapOnce,
} from '../shared/defaults';
import type { ExportForeignKey, ExportTable } from '../shared/export-model';
import {
    indexColumnText,
    indexKeys,
    prepareExport,
    sortedStatements,
} from '../shared/export-model';
import {
    byText,
    claimName,
    commaList,
    firstSeen,
    linesOf,
    oneLine,
    qualify,
    quoteBracket,
    scopes,
    toIdentifier,
} from '../shared/text';

const LENGTH_TYPES = new Set([
    'varchar',
    'nvarchar',
    'char',
    'nchar',
    'varbinary',
]);

const MAX_INDEX_COLUMNS = 32;

/** Type name as stored plus its arguments. */
export function sqlServerType(column: Column): string {
    const name = column.type.name;
    const lower = name.toLowerCase();
    if (LENGTH_TYPES.has(lower) && column.length !== undefined) {
        const text =
            column.length === 'max' || column.length === -1
                ? 'MAX'
                : String(column.length);
        return `${name}(${text})`;
    }
    if (
        (lower === 'decimal' || lower === 'numeric') &&
        column.precision !== undefined
    )
        return column.scale !== undefined
            ? `${name}(${column.precision}, ${column.scale})`
            : `${name}(${column.precision})`;
    return name;
}

export function sqlServerDefault(raw: string): string {
    let text = raw.trim();
    let unwrapped = false;
    for (
        let inner = unwrapOnce(text);
        inner !== undefined;
        inner = unwrapOnce(text)
    ) {
        text = inner;
        unwrapped = true;
    }
    if (unwrapped && /^'(?:[^']|'')*'$/s.test(text)) return `N${text}`;
    if (text === '*') return "N'*'";
    if (
        isQuotedText(text) ||
        isFunctionCall(text) ||
        isKeywordDefault(text) ||
        isKnownForm(text) ||
        isNumberText(text)
    )
        return text;
    if (/[+\-*/%|&^<>=!]/.test(text)) return `N${asStringLiteral(text)}`;
    return asStringLiteral(text);
}

function columnLine(column: Column): string {
    const notes = column.comments
        ? linesOf(column.comments)
              .map((l) => `    -- ${l}\n`)
              .join('')
        : '';
    const text = column.default?.trim() ?? '';
    const numbered = column.increment || isNumberingMarker(text);
    if (column.generated) {
        // a computed column has no type in T-SQL: the server infers it
        let computed = `${quoteBracket(column.name)} AS (${column.generated.expression})`;
        if (column.generated.stored) {
            computed += ' PERSISTED';
            if (!column.nullable) computed += ' NOT NULL';
        }
        if (!column.primaryKey && column.unique) computed += ' UNIQUE';
        return `${notes}    ${computed}`;
    }
    let line = `${quoteBracket(column.name)} ${sqlServerType(column)}`;
    if (!column.nullable) line += ' NOT NULL';
    if (numbered) line += ' IDENTITY(1,1)';
    if (!column.primaryKey && column.unique) line += ' UNIQUE';
    if (!numbered && text !== '') line += ` DEFAULT ${sqlServerDefault(text)}`;
    return `${notes}    ${line}`;
}

function indexStatements(table: ExportTable, qualified: string): string[] {
    const { entity } = table;
    const out = indexKeys(table, { byColumns: false }).map(
        ({ key, columns }) => {
            const used = columns.slice(0, MAX_INDEX_COLUMNS);
            const warning =
                columns.length > MAX_INDEX_COLUMNS
                    ? `/* WARNING: This index originally had ${columns.length} columns. It has been truncated to ${MAX_INDEX_COLUMNS} columns due to SQL Server's index column limit. */\n`
                    : '';
            const name =
                entity.schema && !key.label.startsWith(`${entity.schema}_`)
                    ? `${entity.schema}_${key.label}`
                    : key.label;
            return `${warning}CREATE ${key.distinct ? 'UNIQUE ' : ''}INDEX ${quoteBracket(
                name
            )} ON ${qualified} (${commaList(used.map((c) => indexColumnText(key, c, quoteBracket)))})${
                key.where ? ` WHERE ${key.where}` : ''
            };`;
        }
    );
    return sortedStatements(out);
}

function tableText(table: ExportTable): string {
    const { entity } = table;
    const qualified = qualify(quoteBracket, entity.schema, entity.name);
    const parts = table.columns.map(columnLine);
    if (table.primary.length > 0)
        parts.push(
            `    PRIMARY KEY (${commaList(
                table.primary.map((c) => quoteBracket(c.name))
            )})`
        );
    for (const rule of table.rules)
        if (rule.expression.trim())
            parts.push(`    CHECK (${rule.expression})`);
    const header = entity.comments
        ? `/**\n${entity.comments.replace(/\*\//g, '* /')}\n*/\n`
        : '';
    let text = `${header}CREATE TABLE ${qualified} (\n${parts.join(',\n')}\n);\n`;
    const indexes = indexStatements(table, qualified);
    if (indexes.length > 0) text += `\n-- Indexes\n${indexes.join('\n')}`;
    return `${text}\n`;
}

function schemaStatement(schema: string): string {
    const asText = schema.replace(/'/g, "''");
    const inBrackets = schema.replace(/\]/g, ']]').replace(/'/g, "''");
    return `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '${asText}')\nBEGIN\n    EXEC('CREATE SCHEMA [${inBrackets}]');\nEND;`;
}

function foreignKeyBlock(keys: ExportForeignKey[]): string {
    // constraint names are unique per schema
    const used = scopes();
    const bySchema = new Map<string, ExportForeignKey[]>();
    for (const fk of keys) {
        const schema = fk.holder.schema || 'dbo';
        bySchema.set(schema, [...(bySchema.get(schema) ?? []), fk]);
    }
    const groups = [...bySchema.keys()].sort(byText).map((schema) => {
        const statements = bySchema.get(schema)!.map((fk) => {
            const name = claimName(
                used(schema),
                fk.name ||
                    toIdentifier(
                        `fk_${fk.holder.name}_${fk.columns.map((c) => c.name).join('_')}`
                    ),
                128
            );
            return `ALTER TABLE ${qualify(
                quoteBracket,
                fk.holder.schema,
                fk.holder.name
            )} ADD CONSTRAINT ${quoteBracket(name)} FOREIGN KEY(${commaList(
                fk.columns.map((c) => quoteBracket(c.name))
            )}) REFERENCES ${qualify(
                quoteBracket,
                fk.referenced.schema,
                fk.referenced.name
            )}(${commaList(fk.referencedColumns.map((c) => quoteBracket(c.name)))});`;
        });
        return `-- Schema: ${oneLine(schema)}\n${statements.join('\n')}`;
    });
    return `\n-- Foreign key constraints\n${groups.join('\n\n')}`;
}

/** SQL Server script for a design (EXP-026 to EXP-031). */
export function writeSqlServer(design: Design): string {
    const model = prepareExport(design);
    if (model.tables.length === 0) return '';
    const schemas = firstSeen(
        model.tables.map((t) => t.entity.schema).filter((s): s is string => !!s)
    );
    let out = '';
    if (schemas.length > 0)
        out += `${schemas.map(schemaStatement).join('\n')}\n`;
    out += model.tables.map(tableText).join('\n');
    if (model.foreignKeys.length > 0) out += foreignKeyBlock(model.foreignKeys);
    return out;
}
