import type { Column } from '@/core/model/column';
import type { Design } from '@/core/model/design';
import { sizeSuffix } from '@/core/model/type-suffix';
import type { UserType } from '@/core/model/user-type';
import { listOf } from '@/core/model/collection';
import type { DialectCapabilities } from '../dialect';
import type { ExportForeignKey, ExportTable } from '../shared/export-model';
import {
    indexColumnText,
    indexKeys,
    prepareExport,
    sortedStatements,
} from '../shared/export-model';
import { pgDefault } from '../postgresql/write';
import {
    claimName,
    clip,
    commaList,
    firstSeen,
    linesOf,
    oneLine,
    qualify,
    quoteDouble,
    scopes,
    sqlString,
    toIdentifier,
} from '../shared/text';

/** Identifiers longer than this are cut: the shortest limit among the databases that use this writer. */
const NAME_LIMIT = 128;

export interface GenericWriteOptions {
    /** what the target database can say (schemas, custom types, checks, comments) */
    capabilities: DialectCapabilities;
    /** comment lines that open the script (without the `-- `), none for no header */
    header?: readonly string[];
    /** the target's own spelling of its types; a name that matches one ignoring case is written that way */
    spelling?: readonly string[];
}

/** The text of a column's type: the name as written, then its size. */
function typeText(
    column: Column,
    capabilities: DialectCapabilities,
    spelling: readonly string[] = []
): string {
    const written = column.type.name;
    const name =
        spelling.find((s) => s.toLowerCase() === written.toLowerCase()) ??
        written;
    const base = /\(/.test(name) ? name : `${name}${sizeSuffix(column)}`;
    return column.isArray && capabilities.arrayColumns ? `${base}[]` : base;
}

function columnLine(column: Column, options: GenericWriteOptions): string {
    const { capabilities } = options;
    let line = `${quoteDouble(column.name)} ${typeText(
        column,
        capabilities,
        options.spelling
    )}`;
    if (!column.nullable) line += ' NOT NULL';
    if (!column.primaryKey && column.unique) line += ' UNIQUE';
    if (column.increment) line += ' /* AUTO_INCREMENT */';
    const raw = column.default?.trim() ?? '';
    if (raw !== '' && !/identity|autoincrement/i.test(raw))
        line += ` DEFAULT ${pgDefault(raw, column)}`;
    return `    ${line}`;
}

function indexStatements(
    table: ExportTable,
    qualified: string,
    used: Set<string>
): string[] {
    const out: string[] = [];
    for (const { key, columns } of indexKeys(table, { byColumns: true })) {
        const base = toIdentifier(
            key.label.startsWith(`${table.entity.name}_`)
                ? key.label
                : `${table.entity.name}_${key.label}`
        );
        const name = claimName(used, base, NAME_LIMIT);
        out.push(
            `CREATE ${key.distinct ? 'UNIQUE ' : ''}INDEX ${quoteDouble(
                name
            )} ON ${qualified} (${commaList(
                columns.map((c) => indexColumnText(key, c, quoteDouble))
            )});`
        );
    }
    return sortedStatements(out);
}

function tableText(
    table: ExportTable,
    options: GenericWriteOptions,
    indexNames: Set<string>
): string {
    const { capabilities } = options;
    const { entity } = table;
    const qualified = qualify(
        quoteDouble,
        capabilities.schemas ? entity.schema : undefined,
        entity.name
    );
    const parts = table.columns.map((c) => columnLine(c, options));
    if (table.primary.length > 0)
        parts.push(
            `    PRIMARY KEY (${commaList(
                table.primary.map((c) => quoteDouble(c.name))
            )})`
        );
    if (capabilities.checkConstraints)
        for (const rule of table.rules)
            if (rule.expression.trim())
                parts.push(`    CHECK (${rule.expression})`);
    let text = '';
    if (entity.comments)
        text += linesOf(entity.comments)
            .map((l) => `-- ${l}\n`)
            .join('');
    text += `CREATE TABLE ${qualified} (\n${parts.join(',\n')}\n);`;
    if (capabilities.nativeComments) {
        if (entity.comments)
            text += `\nCOMMENT ON TABLE ${qualified} IS ${sqlString(
                oneLine(entity.comments)
            )};`;
        for (const c of table.columns)
            if (c.comments)
                text += `\nCOMMENT ON COLUMN ${qualified}.${quoteDouble(
                    c.name
                )} IS ${sqlString(oneLine(c.comments))};`;
    }
    const indexes = indexStatements(table, qualified, indexNames);
    if (indexes.length > 0) text += `\n-- Indexes\n${indexes.join('\n')}`;
    return `${text}\n`;
}

function userTypeText(type: UserType): string {
    const name = qualify(quoteDouble, type.schema, type.name);
    if (type.kind === 'enum')
        return `CREATE TYPE ${name} AS ENUM (${commaList(
            (type.values ?? []).map(sqlString)
        )});`;
    return `CREATE TYPE ${name} AS (${commaList(
        (type.members ?? []).map((m) => `${quoteDouble(m.name)} ${m.type}`)
    )});`;
}

function foreignKeyName(fk: ExportForeignKey): string {
    return clip(
        toIdentifier(
            [
                'fk',
                fk.holder.name,
                ...fk.columns.map((c) => c.name),
                fk.referenced.name,
                ...fk.referencedColumns.map((c) => c.name),
            ].join('_')
        ),
        NAME_LIMIT
    );
}

function foreignKeyBlock(
    keys: ExportForeignKey[],
    capabilities: DialectCapabilities
): string {
    const used = scopes();
    const schemaOf = (s: string | undefined) =>
        capabilities.schemas ? s : undefined;
    const statements = keys.map(
        (fk) =>
            `ALTER TABLE ${qualify(
                quoteDouble,
                schemaOf(fk.holder.schema),
                fk.holder.name
            )} ADD CONSTRAINT ${quoteDouble(
                claimName(
                    used(`${fk.holder.schema ?? ''}\u0000${fk.holder.name}`),
                    foreignKeyName(fk),
                    NAME_LIMIT
                )
            )} FOREIGN KEY (${commaList(
                fk.columns.map((c) => quoteDouble(c.name))
            )}) REFERENCES ${qualify(
                quoteDouble,
                schemaOf(fk.referenced.schema),
                fk.referenced.name
            )} (${commaList(
                fk.referencedColumns.map((c) => quoteDouble(c.name))
            )});`
    );
    return `\n-- Foreign key constraints\n${statements.join('\n')}`;
}

/**
 * The generic generator (EXP-008): one plain script for a design whose database
 * has no writer of its own. Types and defaults are copied as written, so the
 * script opens with a warning that it needs checking. Views are left out.
 */
export function writeGenericSql(
    design: Design,
    options: GenericWriteOptions
): string {
    const model = prepareExport(design);
    if (model.tables.length === 0) return '';
    const { capabilities } = options;
    const types = capabilities.enumTypes
        ? listOf(design.userTypes).filter((t) => t.kind === 'enum')
        : [];
    const composites = capabilities.compositeTypes
        ? listOf(design.userTypes).filter((t) => t.kind === 'composite')
        : [];
    const schemas = capabilities.schemas
        ? firstSeen(
              model.tables
                  .map((t) => t.entity.schema)
                  .filter((s): s is string => !!s)
          )
        : [];
    const sequences = firstSeen(
        model.tables.flatMap((t) =>
            t.columns.flatMap((c) => {
                const found = /nextval\(\s*'([^']+)'/i.exec(c.default ?? '');
                return found ? [found[1]] : [];
            })
        )
    );

    let out = '';
    if (options.header && options.header.length > 0)
        out += `${options.header.map((l) => `-- ${l}`).join('\n')}\n\n`;
    if (schemas.length > 0)
        out += `${schemas
            .map((s) => `CREATE SCHEMA IF NOT EXISTS ${quoteDouble(s)};`)
            .join('\n')}\n\n`;
    const typeStatements = [...types, ...composites].map(userTypeText);
    if (typeStatements.length > 0) out += `${typeStatements.join('\n')}\n\n`;
    if (sequences.length > 0)
        out += `${sequences
            .map((s) => `CREATE SEQUENCE IF NOT EXISTS ${s};`)
            .join('\n')}\n\n`;
    const used = scopes();
    out += model.tables
        .map((t) => tableText(t, options, used(t.entity.schema ?? '')))
        .join('\n');
    if (model.foreignKeys.length > 0)
        out += foreignKeyBlock(model.foreignKeys, capabilities);
    return out;
}

/** The comment lines that open a generic script written for another database pair. */
export function pairHeader(from: string, to: string): string[] {
    return [
        `${from} to ${to}`,
        'WARNING: there is no converter for this pair. Column types and defaults are',
        'copied as written and need to be checked before this script is run.',
    ];
}

/** The comment lines that open a script for a database that has no generator of its own. */
export function ownHeader(label: string): string[] {
    return [
        `${label} (generic SQL)`,
        `WARNING: QBase has no ${label}-specific SQL generator. Column types and defaults are`,
        'copied as written and need to be checked before this script is run.',
    ];
}
