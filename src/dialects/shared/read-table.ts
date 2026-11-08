import type {
    Diagnostic,
    ScriptColumn,
    ScriptKey,
    ScriptTable,
    TableName,
} from '../script-model';
import { Cursor, splitTop } from './cursor';
import type { ReaderProfile } from './profile';
import type { Token } from './tokenizer';
import { isKeyMethod } from '@/core/model/key';
import type { KeyMethod } from '@/core/model/key';

/** Words that end a column type. */
const TYPE_STOPPERS = new Set([
    'NOT',
    'NULL',
    'DEFAULT',
    'PRIMARY',
    'UNIQUE',
    'REFERENCES',
    'CHECK',
    'CONSTRAINT',
    'COLLATE',
    'COMMENT',
    'AUTO_INCREMENT',
    'AUTOINCREMENT',
    'GENERATED',
    'IDENTITY',
    'CHARSET',
    'ON',
    'AS',
    'KEY',
    'ROWGUIDCOL',
    'SPARSE',
    'FILESTREAM',
    'INVISIBLE',
    'VISIBLE',
]);

const AFTER_ARGUMENT_WORDS = new Set([
    'WITH',
    'WITHOUT',
    'TIME',
    'ZONE',
    'LOCAL',
    'VARYING',
    'PRECISION',
    'UNSIGNED',
    'ZEROFILL',
    'SIGNED',
]);

const DROPPED_TYPE_WORDS = new Set(['unsigned', 'zerofill', 'signed']);
const LENGTH_TYPES = new Set([
    'char',
    'varchar',
    'nchar',
    'nvarchar',
    'varchar2',
    'nvarchar2',
    'raw',
    'binary',
    'varbinary',
]);
const PRECISION_TYPES = new Set([
    'decimal',
    'numeric',
    'dec',
    'number',
    'float',
    'double',
    'double precision',
    'real',
]);
const NUMBERED_TYPES = new Set([
    'serial',
    'bigserial',
    'smallserial',
    'serial2',
    'serial4',
    'serial8',
]);

export interface ReadContext {
    profile: ReaderProfile;
    source: string;
    diagnostics: Diagnostic[];
}

export interface TypeRead {
    typeName: string;
    length?: number | 'max';
    precision?: number;
    scale?: number;
    isArray: boolean;
}

/** Reads `varchar(20)`, `double precision`, `timestamp(3) with time zone`, `int[]`. */
export function readType(cur: Cursor, ctx: ReadContext): TypeRead {
    const words: string[] = [];
    let args: Token[] = [];
    let quoted = false;

    const takeWord = (): void => {
        const t = cur.next()!;
        // a qualified type such as public.mood keeps its last part
        if (
            cur.isPunct('.') &&
            (cur.peek(1)?.kind === 'word' || cur.peek(1)?.kind === 'ident')
        ) {
            cur.next();
            takeWord();
            return;
        }
        quoted = quoted || t.kind === 'ident';
        words.push(t.kind === 'ident' ? t.value : t.value.toLowerCase());
    };

    for (;;) {
        const t = cur.peek();
        if (!t || (t.kind !== 'word' && t.kind !== 'ident')) break;
        const upper = t.value.toUpperCase();
        if (t.kind === 'word' && words.length > 0) {
            if (TYPE_STOPPERS.has(upper)) break;
            if (upper === 'CHARACTER' && cur.isWord('SET', 1)) break;
        }
        if (words.length >= 5) break;
        takeWord();
        if (cur.isPunct('(')) break;
    }
    if (cur.isPunct('(')) {
        args = cur.readGroup();
        while (
            cur.peek()?.kind === 'word' &&
            AFTER_ARGUMENT_WORDS.has(cur.peekWord())
        )
            takeWord();
    }

    let isArray = false;
    for (;;) {
        if (cur.isPunct('[') && ctx.profile.arrayTypes) {
            cur.next();
            while (!cur.done && !cur.isPunct(']')) cur.next();
            cur.next();
            isArray = true;
        } else if (cur.isWord('ARRAY') && ctx.profile.arrayTypes) {
            cur.next();
            isArray = true;
        } else break;
    }

    let name = words
        .filter((w) => quoted || !DROPPED_TYPE_WORDS.has(w))
        .join(' ');
    if (!quoted) name = ctx.profile.typeSynonyms[name] ?? name;
    const out: TypeRead = { typeName: name, isArray };

    const numbers = splitTop(args).map((part) =>
        part.map((t) => t.value).join('')
    );
    if (numbers.length > 0 && !quoted) {
        const first = numbers[0];
        if (LENGTH_TYPES.has(name)) {
            if (first.toLowerCase() === 'max') out.length = 'max';
            else if (/^\d+(?:byte|char)?$/i.test(first))
                // Oracle: VARCHAR2(50 CHAR) counts characters, VARCHAR2(50 BYTE) bytes
                out.length = Number.parseInt(first, 10);
        } else if (PRECISION_TYPES.has(name)) {
            if (/^\d+$/.test(first)) out.precision = Number(first);
            if (numbers[1] !== undefined && /^-?\d+$/.test(numbers[1]))
                out.scale = Number(numbers[1]);
        }
    }
    return out;
}

const OPERATORS = new Set(['||', '+', '-', '*', '/', '%']);

/** Reads a default expression and returns its text as written. */
function readDefault(cur: Cursor, ctx: ReadContext): string | undefined {
    const first = cur.peek();
    if (!first) return undefined;
    const operand = (): void => {
        if (
            cur.peek()?.kind === 'punct' &&
            ['+', '-'].includes(cur.peek()!.text)
        )
            cur.next();
        const t = cur.next();
        if (!t) return;
        if (t.kind === 'punct' && t.text === '(') {
            cur.pos--;
            cur.readGroup();
            return;
        }
        const following = cur.peek();
        if (
            t.kind === 'word' &&
            following?.kind === 'string' &&
            following.start === t.end
        )
            cur.next();
        if (cur.isPunct('(')) cur.readGroup();
        if (
            t.kind === 'word' &&
            t.value.toUpperCase() === 'NEXT' &&
            cur.acceptWords('VALUE', 'FOR')
        )
            cur.readName();
    };
    operand();
    for (;;) {
        if (cur.isPunct('::')) {
            cur.next();
            let count = 0;
            for (;;) {
                const t = cur.peek();
                if (!t || (t.kind !== 'word' && t.kind !== 'ident')) break;
                if (
                    count > 0 &&
                    t.kind === 'word' &&
                    TYPE_STOPPERS.has(t.value.toUpperCase())
                )
                    break;
                cur.next();
                count++;
                if (cur.isPunct('.')) {
                    cur.next();
                    continue;
                }
                if (cur.isPunct('(')) cur.readGroup();
            }
            while (cur.isPunct('[')) {
                while (!cur.done && !cur.isPunct(']')) cur.next();
                cur.next();
            }
            continue;
        }
        const op = cur.peek();
        if (op && op.kind === 'punct' && OPERATORS.has(op.text)) {
            cur.next();
            operand();
            continue;
        }
        break;
    }
    const text = ctx.source.slice(first.start, cur.last()!.end).trim();
    return /^null$/i.test(text) ? undefined : text;
}

/** Skips ON DELETE/UPDATE, MATCH, DEFERRABLE ... after a REFERENCES clause. */
function skipReferentialTail(cur: Cursor): void {
    for (;;) {
        if (
            cur.isWord('ON') &&
            (cur.isWord('DELETE', 1) || cur.isWord('UPDATE', 1))
        ) {
            cur.pos += 2;
            if (cur.acceptWords('NO', 'ACTION')) continue;
            if (cur.acceptWord('SET')) {
                cur.next();
                if (cur.isPunct('(')) cur.readGroup();
                continue;
            }
            cur.next();
        } else if (cur.acceptWord('MATCH')) cur.next();
        else if (
            cur.acceptWords('NOT', 'DEFERRABLE') ||
            cur.acceptWord('DEFERRABLE')
        )
            continue;
        else if (cur.acceptWord('INITIALLY')) cur.next();
        else if (
            cur.acceptWords('NOT', 'ENFORCED') ||
            cur.acceptWord('ENFORCED')
        )
            continue;
        else break;
    }
}

export interface ReferenceRead {
    table: TableName;
    columns: string[];
}

function readReference(cur: Cursor): ReferenceRead | undefined {
    const table = cur.readName();
    if (!table) return undefined;
    const columns = cur.isPunct('(') ? cur.readNameList() : [];
    skipReferentialTail(cur);
    return { table, columns };
}

export interface ParsedColumn {
    column: ScriptColumn;
    checks: string[];
    reference?: ReferenceRead;
    inlinePrimary: boolean;
    line: number;
}

/**
 * Reads `(expr) [STORED|VIRTUAL|PERSISTED]` of a computed column. A column
 * is stored with STORED or PERSISTED; with VIRTUAL or no word it is not.
 */
function readGenerated(cur: Cursor, column: ScriptColumn): void {
    if (!cur.isPunct('(')) return;
    const expression = cur.textOf(cur.readGroup());
    let stored = false;
    if (cur.acceptWord('STORED') || cur.acceptWord('PERSISTED')) stored = true;
    else cur.acceptWord('VIRTUAL');
    if (expression !== '') column.generated = { expression, stored };
}

/** Reads one column definition (the tokens of one element of a table body). */
export function readColumn(
    tokens: Token[],
    ctx: ReadContext
): ParsedColumn | undefined {
    const cur = new Cursor(tokens, ctx.source);
    const nameToken = cur.next();
    if (!nameToken || (nameToken.kind !== 'word' && nameToken.kind !== 'ident'))
        return undefined;
    // `col AS (expr)` (SQL Server, SQLite) has no type: the type cannot be known
    const typeless = cur.isWord('AS') && cur.isPunct('(', 1);
    const type: TypeRead = typeless
        ? { typeName: ctx.profile.viewColumnType, isArray: false }
        : readType(cur, ctx);
    if (typeless)
        ctx.diagnostics.push({
            severity: 'warning',
            message: `Computed column ${nameToken.value} has no type in the script: it was imported as ${ctx.profile.viewColumnType}.`,
            line: nameToken.line,
        });
    const column: ScriptColumn = {
        name: nameToken.value,
        typeName: type.typeName,
        isArray: type.isArray,
        nullable: true,
        primary: false,
        unique: false,
        numbered: NUMBERED_TYPES.has(type.typeName),
    };
    if (type.length !== undefined) column.length = type.length;
    if (type.precision !== undefined) column.precision = type.precision;
    if (type.scale !== undefined) column.scale = type.scale;
    const parsed: ParsedColumn = {
        column,
        checks: [],
        inlinePrimary: false,
        line: nameToken.line,
    };

    while (!cur.done) {
        if (cur.acceptWord('CONSTRAINT')) cur.readName();
        else if (cur.acceptWords('NOT', 'NULL')) column.nullable = false;
        else if (cur.acceptWord('NULL')) column.nullable = true;
        else if (cur.acceptWord('DEFAULT')) {
            const text = readDefault(cur, ctx);
            if (text !== undefined) {
                column.default = text;
                if (/nextval\s*\(/i.test(text)) column.numbered = true;
            }
        } else if (cur.acceptWords('PRIMARY', 'KEY')) {
            parsed.inlinePrimary = true;
            column.primary = true;
            column.nullable = false;
        } else if (cur.acceptWord('UNIQUE')) column.unique = true;
        else if (cur.acceptWord('REFERENCES')) {
            const at = cur.last()!;
            const ref = readReference(cur);
            if (ctx.profile.inlineReferencesAreErrors) {
                ctx.diagnostics.push({
                    severity: 'error',
                    message: `MySQL does not support inline REFERENCES in column definitions (line ${at.line}). Please use FOREIGN KEY constraints instead:`,
                    line: at.line,
                    column: at.column,
                    suggestion:
                        'CREATE TABLE child (parent_id INT, FOREIGN KEY (parent_id) REFERENCES parent(id));',
                });
            } else if (ref) parsed.reference = ref;
        } else if (cur.acceptWord('CHECK')) {
            const inner = cur.readGroup();
            if (inner.length > 0) parsed.checks.push(cur.textOf(inner));
        } else if (
            cur.acceptWord('AUTO_INCREMENT') ||
            cur.acceptWord('AUTOINCREMENT')
        )
            column.numbered = true;
        else if (cur.acceptWord('IDENTITY')) {
            if (cur.isPunct('(')) cur.readGroup();
            column.numbered = true;
        } else if (cur.acceptWord('GENERATED')) {
            if (
                cur.acceptWord('ALWAYS') &&
                cur.isWord('AS') &&
                !cur.isWord('IDENTITY', 1)
            ) {
                cur.next();
                readGenerated(cur, column);
            } else {
                if (cur.acceptWords('BY', 'DEFAULT'))
                    cur.acceptWords('ON', 'NULL');
                if (cur.acceptWords('AS', 'IDENTITY')) {
                    column.numbered = true;
                    if (cur.isPunct('(')) cur.readGroup();
                }
            }
        } else if (cur.isWord('AS') && cur.isPunct('(', 1)) {
            cur.next();
            readGenerated(cur, column);
        } else if (cur.acceptWord('COMMENT')) {
            cur.acceptPunct('=');
            const t = cur.next();
            if (t?.kind === 'string') column.comment = t.value;
        } else if (cur.acceptWord('COLLATE') || cur.acceptWord('CHARSET'))
            cur.next();
        else if (cur.acceptWords('CHARACTER', 'SET')) cur.next();
        else if (cur.isWord('ON') && cur.isWord('UPDATE', 1)) {
            cur.pos += 2;
            cur.next();
            if (cur.isPunct('(')) cur.readGroup();
        } else if (cur.isWord('ON') && cur.isWord('DELETE', 1))
            skipReferentialTail(cur);
        else if (cur.isPunct('(')) cur.readGroup();
        else cur.next();
    }
    if (column.primary && type.typeName === 'integer' && column.numbered)
        column.nullable = false;
    return parsed;
}

export interface IndexColumns {
    columns: string[];
    descending: string[];
    /** items that are expressions (`lower(name)`), not kept */
    skipped: string[];
}

/** Reads the column list of an index: `a`, `b DESC`, `c(10) ASC`; expressions are skipped. */
export function readIndexColumns(
    cur: Cursor,
    ctx: Pick<ReadContext, 'source'>
): IndexColumns {
    const out: IndexColumns = { columns: [], descending: [], skipped: [] };
    for (const item of splitTop(cur.readGroup())) {
        const first = item[0];
        if (!first || (first.kind !== 'word' && first.kind !== 'ident'))
            continue;
        const second = item[1];
        // `lower(name)` is an expression; `name(255)` is a prefix length
        if (second?.text === '(' && item[2]?.kind !== 'number') {
            out.skipped.push(
                ctx.source.slice(first.start, item[item.length - 1].end).trim()
            );
            continue;
        }
        out.columns.push(first.value);
        if (
            item.some(
                (t) => t.kind === 'word' && t.value.toUpperCase() === 'DESC'
            )
        )
            out.descending.push(first.value);
    }
    return out;
}

export interface TableConstraint {
    kind: 'primary' | 'unique' | 'foreign' | 'check' | 'index';
    name?: string;
    columns: string[];
    check?: string;
    reference?: ReferenceRead;
    method?: KeyMethod;
    unique?: boolean;
    descending?: string[];
    line: number;
}

/** Words that always open a table constraint (reserved in every dialect). */
const RESERVED_STARTERS = new Set([
    'CONSTRAINT',
    'PRIMARY',
    'UNIQUE',
    'FOREIGN',
    'CHECK',
]);

/** Type words that tell `like text` (a column) from `LIKE other_table`. */
const COMMON_TYPE_WORDS = new Set([
    'TEXT',
    'INT',
    'INTEGER',
    'BIGINT',
    'SMALLINT',
    'TINYINT',
    'VARCHAR',
    'CHAR',
    'CHARACTER',
    'NVARCHAR',
    'NCHAR',
    'BOOL',
    'BOOLEAN',
    'NUMERIC',
    'DECIMAL',
    'DATE',
    'TIME',
    'TIMESTAMP',
    'DATETIME',
    'UUID',
    'JSON',
    'JSONB',
    'FLOAT',
    'REAL',
    'DOUBLE',
    'SERIAL',
    'BIGSERIAL',
    'BIT',
    'BLOB',
    'BYTEA',
    'MONEY',
    'INTERVAL',
    'VARBINARY',
    'BINARY',
    'MEDIUMINT',
    'XML',
    'ENUM',
]);

const isName = (t: Token | undefined): boolean =>
    !!t && (t.kind === 'word' || t.kind === 'ident');

/**
 * True when the element is a table constraint. `KEY`, `INDEX`, `PERIOD`,
 * `EXCLUDE`, `LIKE`, `FULLTEXT` and `SPATIAL` are legal column names, so they
 * count only when followed by their constraint syntax.
 */
export function startsConstraint(tokens: Token[]): boolean {
    const t = tokens[0];
    if (!t || t.kind !== 'word') return false;
    const word = t.value.toUpperCase();
    if (RESERVED_STARTERS.has(word)) return true;
    const second = tokens[1];
    const secondWord =
        second && second.kind === 'word' ? second.value.toUpperCase() : '';
    const isOpen = (x: Token | undefined): boolean =>
        !!x && x.kind === 'punct' && x.text === '(';
    switch (word) {
        case 'KEY':
        case 'INDEX': {
            if (isOpen(second) || secondWord === 'USING') return true;
            if (!isName(second)) return false;
            // `KEY name (cols)` has names inside; `key varchar(10)` a number
            const third = tokens[2];
            if (
                third &&
                third.kind === 'word' &&
                third.value.toUpperCase() === 'USING'
            )
                return true;
            return isOpen(third) && isName(tokens[3]);
        }
        case 'FULLTEXT':
        case 'SPATIAL':
            return (
                secondWord === 'KEY' || secondWord === 'INDEX' || isOpen(second)
            );
        case 'PERIOD':
            return secondWord === 'FOR';
        case 'EXCLUDE':
            return secondWord === 'USING' || isOpen(second);
        case 'LIKE': {
            if (!isName(second)) return false;
            if (second.kind === 'word' && COMMON_TYPE_WORDS.has(secondWord))
                return false;
            return true;
        }
        default:
            return false;
    }
}

const CLUSTER_WORDS = ['CLUSTERED', 'NONCLUSTERED', 'HASH'];

/** Reads one table-level constraint; undefined for kinds that are ignored. */
export function readConstraint(
    tokens: Token[],
    ctx: ReadContext
): TableConstraint | undefined {
    const cur = new Cursor(tokens, ctx.source);
    const line = tokens[0].line;
    let name: string | undefined;
    if (cur.acceptWord('CONSTRAINT')) name = cur.readName()?.name;
    const skipCluster = (): void => {
        for (const w of CLUSTER_WORDS) cur.acceptWord(w);
    };
    if (cur.acceptWords('PRIMARY', 'KEY')) {
        skipCluster();
        return { kind: 'primary', name, columns: cur.readNameList(), line };
    }
    if (cur.acceptWord('UNIQUE')) {
        skipCluster();
        if (!cur.acceptWord('KEY')) cur.acceptWord('INDEX');
        if (!cur.isPunct('(')) name = name ?? cur.readName()?.name;
        return { kind: 'unique', name, columns: cur.readNameList(), line };
    }
    if (cur.acceptWords('FOREIGN', 'KEY')) {
        if (!cur.isPunct('(')) name = name ?? cur.readName()?.name;
        const columns = cur.readNameList();
        if (!cur.acceptWord('REFERENCES')) return undefined;
        const reference = readReference(cur);
        return { kind: 'foreign', name, columns, reference, line };
    }
    if (cur.acceptWord('CHECK')) {
        const inner = cur.readGroup();
        return {
            kind: 'check',
            name,
            columns: [],
            check: cur.textOf(inner),
            line,
        };
    }
    let method: KeyMethod | undefined;
    if (cur.acceptWord('FULLTEXT')) method = 'fulltext';
    else if (cur.acceptWord('SPATIAL')) method = 'spatial';
    if (cur.acceptWord('KEY') || cur.acceptWord('INDEX')) {
        if (!cur.isPunct('(') && !cur.isWord('USING'))
            name = name ?? cur.readName()?.name;
        const using = (): void => {
            if (!cur.acceptWord('USING')) return;
            const m = cur.next()?.value.toLowerCase();
            if (isKeyMethod(m)) method = m;
        };
        using();
        const listed = readIndexColumns(cur, ctx);
        using();
        return {
            kind: 'index',
            name,
            columns: listed.columns,
            descending: listed.descending,
            method,
            unique: false,
            line,
        };
    }
    return undefined;
}

/** Builds the table shell from its name and parsed elements. */
export function newTable(name: TableName, line: number): ScriptTable {
    return {
        ...name,
        columns: [],
        uniqueKeys: [],
        checks: [],
        view: false,
        materialized: false,
        line,
    };
}

export function keyOf(columns: string[], name?: string): ScriptKey {
    return name ? { name, columns } : { columns };
}
