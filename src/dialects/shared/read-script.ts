import { plainStringDefault } from './defaults';
import { isKeyMethod } from '@/core/model/key';
import type { KeyMethod } from '@/core/model/key';
import type {
    Diagnostic,
    ScriptColumn,
    ScriptResult,
    ScriptTable,
    TableName,
} from '../script-model';
import { Cursor, splitTop } from './cursor';
import { resolveTable, sameName } from './names';
import type { ReaderProfile } from './profile';
import {
    keyOf,
    newTable,
    readColumn,
    readConstraint,
    readIndexColumns,
    readType,
    startsConstraint,
} from './read-table';
import type { ReadContext, TypeRead } from './read-table';
import { blankCopyData, splitStatements } from './statements';
import type { Statement } from './statements';
import { lex } from './tokenizer';
import type { Token } from './tokenizer';

const CREATE_MODIFIERS = new Set([
    'OR',
    'REPLACE',
    'ALTER',
    'GLOBAL',
    'LOCAL',
    'TEMP',
    'TEMPORARY',
    'UNLOGGED',
    'UNIQUE',
    'CLUSTERED',
    'NONCLUSTERED',
    'FULLTEXT',
    'SPATIAL',
    'BITMAP',
    'XML',
    'PRIMARY',
    'MATERIALIZED',
    'RECURSIVE',
    'COLUMNSTORE',
]);

const CREATE_OBJECTS = new Set([
    'TABLE',
    'VIEW',
    'INDEX',
    'TYPE',
    'EXTENSION',
    'FUNCTION',
    'PROCEDURE',
    'TRIGGER',
    'POLICY',
    'SEQUENCE',
    'DOMAIN',
    'SCHEMA',
    'DATABASE',
]);

/** CREATE objects reported once as skipped (not silently dropped). */
const SKIPPED_KINDS: Record<string, string> = {
    EXTENSION: 'CREATE EXTENSION',
    FUNCTION: 'CREATE FUNCTION',
    PROCEDURE: 'CREATE PROCEDURE',
    TRIGGER: 'CREATE TRIGGER',
    POLICY: 'CREATE POLICY',
    SEQUENCE: 'CREATE SEQUENCE',
};

/** The kinds a PostgreSQL validator already reports on its own. */
const REPORTED_BY_VALIDATOR = new Set([
    'CREATE EXTENSION',
    'CREATE FUNCTION',
    'CREATE TRIGGER',
]);

interface PendingAlter {
    table: TableName;
    actions: Token[][];
    line: number;
}

interface PendingComment {
    target: 'table' | 'column';
    parts: string[];
    text: string;
    line: number;
}

function findTable(
    tables: ScriptTable[],
    name: TableName,
    ctx?: ReadContext,
    what?: string,
    line?: number
): ScriptTable | undefined {
    const { found, ambiguous } = resolveTable(tables, (t) => t, name);
    if (ctx && what) {
        const shown = name.schema ? `${name.schema}.${name.name}` : name.name;
        if (!found)
            ctx.diagnostics.push({
                severity: 'warning',
                message: `${what} ignored: table ${shown} is not in the script.`,
                line,
            });
        else if (ambiguous)
            ctx.diagnostics.push({
                severity: 'warning',
                message: `${what} names ${shown} without a schema and several schemas have it: the first was used.`,
                line,
            });
    }
    return found;
}

function applyPrimary(table: ScriptTable): void {
    if (!table.primaryKey) return;
    for (const col of table.columns) {
        if (table.primaryKey.columns.some((n) => sameName(n, col.name))) {
            col.primary = true;
            col.nullable = false;
        }
    }
}

function readCreateTable(
    cur: Cursor,
    line: number,
    modifiers: Set<string>,
    ctx: ReadContext,
    out: ScriptResult,
    skip: (kind: string) => void
): void {
    if (modifiers.has('TEMP') || modifiers.has('TEMPORARY')) {
        skip('CREATE TEMPORARY TABLE');
        return;
    }
    cur.acceptWords('IF', 'NOT', 'EXISTS');
    const name = cur.readName();
    if (!name) return;
    if (!cur.isPunct('(')) {
        skip('CREATE TABLE ... AS, LIKE or PARTITION OF');
        return;
    }
    const body = cur.readGroup();
    const table = newTable(name, line);
    const inlinePrimary: string[] = [];

    for (const element of splitTop(body)) {
        if (element.length === 0) continue;
        if (startsConstraint(element)) {
            const c = readConstraint(element, ctx);
            if (!c) {
                ctx.diagnostics.push({
                    severity: 'warning',
                    message: `A constraint of table ${name.name} was ignored: ${ctx.source
                        .slice(
                            element[0].start,
                            element[element.length - 1].end
                        )
                        .trim()
                        .split(/\s+/)
                        .slice(0, 3)
                        .join(' ')} ...`,
                    line: element[0].line,
                });
                continue;
            }
            if (c.kind === 'primary')
                table.primaryKey = keyOf(c.columns, c.name);
            else if (c.kind === 'unique')
                table.uniqueKeys.push(keyOf(c.columns, c.name));
            else if (c.kind === 'check' && c.check) table.checks.push(c.check);
            else if (c.kind === 'foreign' && c.reference)
                out.foreignKeys.push({
                    name: c.name,
                    table: name,
                    columns: c.columns,
                    refTable: c.reference.table,
                    refColumns: c.reference.columns,
                    line: c.line,
                });
            else if (c.kind === 'index')
                out.indexes.push({
                    table: name,
                    name: c.name ?? `${name.name}_${c.columns.join('_')}_idx`,
                    unique: false,
                    columns: c.columns,
                    ...(c.descending?.length
                        ? { descending: c.descending }
                        : {}),
                    method: c.method,
                    line: c.line,
                });
            continue;
        }
        const parsed = readColumn(element, ctx);
        if (!parsed) continue;
        const { column } = parsed;
        if (table.columns.some((c) => c.name === column.name)) {
            ctx.diagnostics.push({
                severity: 'warning',
                message: `Column ${column.name} is defined twice in table ${name.name}: the second definition was ignored.`,
                line: parsed.line,
            });
            continue;
        }
        table.columns.push(column);
        if (parsed.inlinePrimary) inlinePrimary.push(column.name);
        table.checks.push(...parsed.checks);
        if (parsed.reference)
            out.foreignKeys.push({
                table: name,
                columns: [column.name],
                refTable: parsed.reference.table,
                refColumns: parsed.reference.columns,
                line: parsed.line,
            });
    }
    if (!table.primaryKey && inlinePrimary.length > 0)
        table.primaryKey = keyOf(inlinePrimary);
    applyPrimary(table);

    // table options after the closing parenthesis: COMMENT [=] 'text'
    const tail = cur.tokens.slice(cur.pos);
    for (let i = 0; i < tail.length; i++) {
        if (
            tail[i].kind === 'word' &&
            tail[i].value.toUpperCase() === 'COMMENT'
        ) {
            const at = tail[i + 1]?.text === '=' ? i + 2 : i + 1;
            if (tail[at]?.kind === 'string') table.comment = tail[at].value;
        }
    }
    out.tables.push(table);
}

/** Names selected by the first SELECT of a view body, or undefined for `*`. */
function selectedNames(body: Token[]): string[] {
    let i = 0;
    while (body[i]?.text === '(') i++;
    if (!(body[i]?.kind === 'word' && body[i].value.toUpperCase() === 'SELECT'))
        return [];
    i++;
    const word = (k: number): string =>
        body[k]?.kind === 'word' ? body[k].value.toUpperCase() : '';
    if (word(i) === 'DISTINCT' || word(i) === 'ALL') i++;
    if (word(i) === 'ON' && body[i + 1]?.text === '(') {
        let depth = 0;
        do {
            if (body[i].text === '(') depth++;
            if (body[i].text === ')') depth--;
            i++;
        } while (i < body.length && depth > 0);
    }
    if (word(i) === 'TOP') {
        i += 2;
        if (word(i) === 'PERCENT') i++;
    }
    const items: Token[] = [];
    let depth = 0;
    for (; i < body.length; i++) {
        const t = body[i];
        if (t.kind === 'punct' && t.text === '(') depth++;
        else if (t.kind === 'punct' && t.text === ')') depth--;
        if (depth < 0) break;
        if (depth === 0 && word(i) === 'FROM') break;
        items.push(t);
    }
    const names: string[] = [];
    for (const item of splitTop(items)) {
        const last = item[item.length - 1];
        if (!last) continue;
        if (last.text === '*') return [];
        if (last.kind !== 'word' && last.kind !== 'ident') continue;
        const before = item[item.length - 2];
        if (item.length === 1 || before?.text === '.') names.push(last.value);
        else if (before?.kind === 'word' && before.value.toUpperCase() === 'AS')
            names.push(last.value);
        else if (
            before &&
            (before.kind === 'word' ||
                before.kind === 'ident' ||
                before.kind === 'string' ||
                before.kind === 'number' ||
                before.text === ')') &&
            last.kind === 'ident'
        )
            names.push(last.value);
        else if (before && (before.text === ')' || before.kind === 'ident'))
            names.push(last.value);
    }
    return names;
}

function readCreateView(
    cur: Cursor,
    line: number,
    modifiers: Set<string>,
    ctx: ReadContext,
    out: ScriptResult
): void {
    cur.acceptWords('IF', 'NOT', 'EXISTS');
    const name = cur.readName();
    if (!name) return;
    let listed: string[] = [];
    if (cur.isPunct('(')) listed = cur.readNameList();
    while (!cur.done && !cur.isWord('AS')) {
        if (cur.isPunct('(')) cur.readGroup();
        else cur.next();
    }
    cur.next();
    const body = cur.tokens.slice(cur.pos);
    const names = listed.length > 0 ? listed : selectedNames(body);
    const table = newTable(name, line);
    table.view = true;
    table.materialized = modifiers.has('MATERIALIZED');
    table.columns = names.map((n): ScriptColumn => ({
        name: n,
        typeName: ctx.profile.viewColumnType,
        isArray: false,
        nullable: true,
        primary: false,
        unique: false,
        numbered: false,
    }));
    if (names.length === 0)
        ctx.diagnostics.push({
            severity: 'warning',
            message: `View ${name.name} has no columns that can be read from its definition.`,
            line,
        });
    out.tables.push(table);
}

/** Words that end a filtered-index predicate in SQL Server (WITH (...), ON filegroup). */
const PREDICATE_ENDERS = new Set(['WITH', 'ON', 'TABLESPACE']);

function readCreateIndex(
    cur: Cursor,
    line: number,
    modifiers: Set<string>,
    ctx: ReadContext,
    out: ScriptResult
): void {
    cur.acceptWord('CONCURRENTLY');
    cur.acceptWords('IF', 'NOT', 'EXISTS');
    const name = cur.isWord('ON') ? undefined : cur.readName();
    if (!cur.acceptWord('ON')) return;
    cur.acceptWord('ONLY');
    const table = cur.readName();
    if (!table) return;
    let method: KeyMethod | undefined;
    // CREATE [UNIQUE] [CLUSTERED | NONCLUSTERED] [COLUMNSTORE | XML | FULLTEXT | SPATIAL | BITMAP] INDEX
    if (modifiers.has('CLUSTERED')) method = 'clustered';
    if (modifiers.has('NONCLUSTERED')) method = 'nonclustered';
    if (modifiers.has('COLUMNSTORE')) method = 'columnstore';
    if (modifiers.has('XML')) method = 'xml';
    if (modifiers.has('FULLTEXT')) method = 'fulltext';
    if (modifiers.has('SPATIAL')) method = 'spatial';
    if (modifiers.has('BITMAP')) method = 'bitmap';
    const readUsing = (): void => {
        if (cur.acceptWord('USING')) {
            const m = cur.next()?.value.toLowerCase();
            if (isKeyMethod(m)) method = m;
        }
    };
    readUsing();
    const listed = readIndexColumns(cur, ctx);
    const { columns, descending } = listed;
    readUsing();
    const indexName = name?.name ?? `${table.name}_${columns.join('_')}_idx`;
    for (const expression of listed.skipped)
        ctx.diagnostics.push({
            severity: 'warning',
            message: `Index ${indexName}: the expression ${expression} is not kept (only plain columns are).`,
            line,
        });
    // INCLUDE (...), WITH (...) and the like, then WHERE predicate
    let where: string | undefined;
    while (!cur.done) {
        if (cur.isWord('INCLUDE') && cur.isPunct('(', 1)) {
            cur.next();
            cur.readGroup();
            ctx.diagnostics.push({
                severity: 'warning',
                message: `Index ${indexName}: its INCLUDE columns are not kept.`,
                line,
            });
        } else if (cur.isWord('WHERE')) {
            cur.next();
            const start = cur.pos;
            let depth = 0;
            while (!cur.done) {
                const t = cur.peek()!;
                if (t.kind === 'punct' && t.text === '(') depth++;
                else if (t.kind === 'punct' && t.text === ')') depth--;
                else if (
                    depth === 0 &&
                    t.kind === 'word' &&
                    PREDICATE_ENDERS.has(t.value.toUpperCase())
                )
                    break;
                cur.next();
            }
            const text = cur.textOf(cur.tokens.slice(start, cur.pos));
            if (text !== '') where = text;
        } else if (cur.isPunct('(')) cur.readGroup();
        else cur.next();
    }
    out.indexes.push({
        table,
        name: indexName,
        unique: modifiers.has('UNIQUE'),
        columns,
        ...(descending.length > 0 ? { descending } : {}),
        ...(where !== undefined ? { where } : {}),
        method,
        line,
    });
}

/** `CREATE DOMAIN name AS type ...`: the base type a column of that domain gets. */
interface DomainBase extends TableName {
    base: TypeRead;
}

function readCreateDomain(
    cur: Cursor,
    line: number,
    ctx: ReadContext,
    domains: DomainBase[]
): void {
    const name = cur.readName();
    if (!name) return;
    cur.acceptWord('AS');
    const base = readType(cur, ctx);
    if (base.typeName === '') return;
    domains.push({ ...name, base });
    const rest = cur.tokens
        .slice(cur.pos)
        .filter((t) => t.kind === 'word')
        .map((t) => t.value.toUpperCase());
    const dropped = ['DEFAULT', 'CHECK', 'COLLATE', 'CONSTRAINT'].filter((w) =>
        rest.includes(w)
    );
    if (dropped.length > 0)
        ctx.diagnostics.push({
            severity: 'warning',
            message: `Domain ${name.name}: its ${dropped.join(', ')} ${dropped.length === 1 ? 'is' : 'are'} not kept (the column keeps the domain name and its base type).`,
            line,
        });
}

/** Columns declared with a domain get the base type and keep the domain's name. */
function applyDomains(tables: ScriptTable[], domains: DomainBase[]): void {
    if (domains.length === 0) return;
    const find = (typeName: string): DomainBase | undefined =>
        resolveTable(domains, (d) => d, { name: typeName }).found;
    for (const table of tables) {
        for (const column of table.columns) {
            const first = find(column.typeName);
            if (!first) continue;
            let domain = first;
            // a domain over a domain: the innermost base type
            for (let depth = 0; depth < 10; depth++) {
                const inner = find(domain.base.typeName);
                if (!inner || inner === domain) break;
                domain = inner;
            }
            const base = domain.base;
            column.domain = first.name;
            column.typeName = base.typeName;
            column.isArray = column.isArray || base.isArray;
            if (base.length !== undefined) column.length = base.length;
            if (base.precision !== undefined) column.precision = base.precision;
            if (base.scale !== undefined) column.scale = base.scale;
        }
    }
}

function readCreateType(
    cur: Cursor,
    out: ScriptResult,
    skip: (kind: string) => void
): void {
    const name = cur.readName();
    if (!name) return;
    if (cur.acceptWords('AS', 'ENUM') && cur.isPunct('(')) {
        const values = splitTop(cur.readGroup())
            .map((part) => part[0])
            .filter((t): t is Token => !!t && t.kind === 'string')
            .map((t) => t.value);
        out.enums.push({ schema: name.schema, name: name.name, values });
        return;
    }
    skip('CREATE TYPE that is not an enum');
}

/** Reads the actions of an ALTER TABLE statement into the tables found. */
function applyAlter(
    alter: PendingAlter,
    out: ScriptResult,
    ctx: ReadContext,
    skip: (kind: string) => void
): void {
    const table = findTable(
        out.tables,
        alter.table,
        ctx,
        'ALTER TABLE',
        alter.line
    );
    for (const action of alter.actions) {
        const cur = new Cursor(action, ctx.source);
        cur.acceptWords('WITH', 'CHECK');
        cur.acceptWords('WITH', 'NOCHECK');
        if (cur.acceptWord('ADD')) {
            const rest = action.slice(cur.pos);
            if (startsConstraint(rest) && !cur.isWord('COLUMN')) {
                const c = readConstraint(rest, ctx);
                if (!c) continue;
                if (c.kind === 'foreign' && c.reference)
                    out.foreignKeys.push({
                        name: c.name,
                        table: alter.table,
                        columns: c.columns,
                        refTable: c.reference.table,
                        refColumns: c.reference.columns,
                        line: c.line,
                    });
                if (!table || c.kind === 'foreign') continue;
                if (c.kind === 'primary') {
                    table.primaryKey = keyOf(c.columns, c.name);
                    applyPrimary(table);
                } else if (c.kind === 'unique')
                    table.uniqueKeys.push(keyOf(c.columns, c.name));
                else if (c.kind === 'check' && c.check)
                    table.checks.push(c.check);
                else if (c.kind === 'index')
                    out.indexes.push({
                        table: alter.table,
                        name:
                            c.name ??
                            `${alter.table.name}_${c.columns.join('_')}_idx`,
                        unique: false,
                        columns: c.columns,
                        ...(c.descending?.length
                            ? { descending: c.descending }
                            : {}),
                        method: c.method,
                        line: c.line,
                    });
                continue;
            }
            cur.acceptWord('COLUMN');
            cur.acceptWords('IF', 'NOT', 'EXISTS');
            const parsed = readColumn(action.slice(cur.pos), ctx);
            if (
                parsed &&
                table &&
                !table.columns.some((c) => c.name === parsed.column.name)
            ) {
                table.columns.push(parsed.column);
                table.checks.push(...parsed.checks);
                if (parsed.inlinePrimary) {
                    table.primaryKey = keyOf([
                        ...(table.primaryKey?.columns ?? []),
                        parsed.column.name,
                    ]);
                }
                if (parsed.reference)
                    out.foreignKeys.push({
                        table: alter.table,
                        columns: [parsed.column.name],
                        refTable: parsed.reference.table,
                        refColumns: parsed.reference.columns,
                        line: parsed.line,
                    });
            }
        } else if (cur.acceptWord('ALTER')) {
            cur.acceptWord('COLUMN');
            const colName = cur.next()?.value;
            const column = table?.columns.find((c) =>
                sameName(c.name, colName ?? '')
            );
            if (!column) continue;
            if (
                cur.acceptWords('SET', 'DATA', 'TYPE') ||
                cur.acceptWord('TYPE')
            ) {
                const type = readType(cur, ctx);
                if (type) {
                    column.typeName = type.typeName;
                    column.isArray = type.isArray;
                    delete column.length;
                    delete column.precision;
                    delete column.scale;
                    if (type.length !== undefined) column.length = type.length;
                    if (type.precision !== undefined)
                        column.precision = type.precision;
                    if (type.scale !== undefined) column.scale = type.scale;
                }
            } else if (cur.acceptWords('SET', 'DEFAULT')) {
                const first = cur.peek();
                if (first) {
                    const text = ctx.source
                        .slice(first.start, action[action.length - 1].end)
                        .trim();
                    column.default = ctx.profile.lex.backslashEscapes
                        ? plainStringDefault(text)
                        : text;
                }
            } else if (cur.acceptWords('SET', 'NOT', 'NULL'))
                column.nullable = false;
            else if (cur.acceptWords('DROP', 'NOT', 'NULL'))
                column.nullable = true;
        } else if (cur.isWord('ENABLE') || cur.isWord('FORCE')) {
            if (cur.isWord('ROW', 1) || cur.isWord('ROW', 2))
                skip('ALTER TABLE ... ROW LEVEL SECURITY');
        }
    }
}

/** Reads SQL text into the neutral script model (no validation). */
export function readStatements(
    text: string,
    profile: ReaderProfile
): ScriptResult {
    const out: ScriptResult = {
        tables: [],
        indexes: [],
        foreignKeys: [],
        enums: [],
        diagnostics: [],
    };
    const diagnostics: Diagnostic[] = [];
    const ctx: ReadContext = { profile, source: text, diagnostics };
    const source = profile.lex.dollarStrings ? blankCopyData(text) : text;
    ctx.source = source;
    const { tokens } = lex(source, profile.lex);
    const statements = splitStatements(tokens, profile.goBatches);

    const skipped = new Map<string, number>();
    const skip = (kind: string): void => {
        skipped.set(kind, (skipped.get(kind) ?? 0) + 1);
    };
    const alters: PendingAlter[] = [];
    const comments: PendingComment[] = [];
    const domains: DomainBase[] = [];

    const handle = (stmt: Statement): void => {
        const cur = new Cursor(stmt.tokens, source);
        const first = cur.peekWord();
        if (first === 'CREATE') {
            cur.next();
            const modifiers = new Set<string>();
            for (;;) {
                const w = cur.peekWord();
                if (CREATE_MODIFIERS.has(w)) {
                    modifiers.add(w);
                    cur.next();
                } else if (
                    w === 'DEFINER' ||
                    w === 'ALGORITHM' ||
                    w === 'SQL'
                ) {
                    while (
                        !cur.done &&
                        !(
                            cur.peek()!.kind === 'word' &&
                            CREATE_OBJECTS.has(cur.peekWord())
                        )
                    )
                        cur.next();
                } else break;
            }
            const object = cur.peekWord();
            cur.next();
            if (object === 'TABLE')
                readCreateTable(cur, stmt.line, modifiers, ctx, out, skip);
            else if (object === 'VIEW')
                readCreateView(cur, stmt.line, modifiers, ctx, out);
            else if (object === 'INDEX')
                readCreateIndex(cur, stmt.line, modifiers, ctx, out);
            else if (object === 'DOMAIN')
                readCreateDomain(cur, stmt.line, ctx, domains);
            else if (object === 'TYPE') readCreateType(cur, out, skip);
            else if (SKIPPED_KINDS[object]) skip(SKIPPED_KINDS[object]);
        } else if (first === 'ALTER' && cur.isWord('TABLE', 1)) {
            cur.pos += 2;
            cur.acceptWord('ONLY');
            cur.acceptWords('IF', 'EXISTS');
            const table = cur.readName();
            if (!table) return;
            alters.push({
                table,
                actions: splitTop(cur.tokens.slice(cur.pos)),
                line: stmt.line,
            });
        } else if (first === 'COMMENT' && cur.isWord('ON', 1)) {
            cur.pos += 2;
            const target = cur.peekWord();
            if (target !== 'TABLE' && target !== 'COLUMN') return;
            cur.next();
            const parts = cur.readParts();
            if (!cur.acceptWord('IS')) return;
            const t = cur.next();
            if (t?.kind === 'string')
                comments.push({
                    target: target === 'TABLE' ? 'table' : 'column',
                    parts,
                    text: t.value,
                    line: stmt.line,
                });
        }
        // every other statement kind is not a data definition: ignored
    };
    for (const stmt of statements) handle(stmt);
    for (const alter of alters) applyAlter(alter, out, ctx, skip);
    applyDomains(out.tables, domains);
    for (const c of comments) {
        const tableName: TableName =
            c.target === 'table'
                ? {
                      schema: c.parts[c.parts.length - 2],
                      name: c.parts[c.parts.length - 1],
                  }
                : {
                      schema: c.parts[c.parts.length - 3],
                      name: c.parts[c.parts.length - 2],
                  };
        const table = findTable(
            out.tables,
            tableName,
            ctx,
            'COMMENT ON',
            c.line
        );
        if (!table) continue;
        if (c.target === 'table') table.comment = c.text;
        else {
            const wanted = c.parts[c.parts.length - 1];
            const column = table.columns.find((col) =>
                sameName(col.name, wanted)
            );
            if (column) column.comment = c.text;
            else
                ctx.diagnostics.push({
                    severity: 'warning',
                    message: `COMMENT ON COLUMN ignored: column ${wanted} is not in table ${table.name}.`,
                    line: c.line,
                });
        }
    }

    for (const [kind, count] of skipped) {
        if (profile.detailedSkips && REPORTED_BY_VALIDATOR.has(kind)) continue;
        diagnostics.push({
            severity: 'warning',
            message: `${count} ${kind} statement${count === 1 ? '' : 's'} skipped: not imported.`,
        });
    }
    out.diagnostics = diagnostics;
    return out;
}
