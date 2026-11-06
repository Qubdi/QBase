import type { Canon, TargetDialect } from './canonical';
import type { RenderedType } from './render-type';

/** What a column default means, read from whichever dialect wrote it. */
export type ParsedDefault =
    | { kind: 'now' }
    | { kind: 'currentDate' }
    | { kind: 'currentTime' }
    | { kind: 'uuid' }
    | { kind: 'null' }
    | { kind: 'bool'; value: boolean }
    | { kind: 'number'; text: string }
    | { kind: 'string'; text: string }
    /** a list, already written as JSON: ARRAY[1, 2] */
    | { kind: 'array'; json: string }
    /** a sequence or identity: the column numbers itself */
    | { kind: 'auto' }
    /** an expression that is not understood */
    | { kind: 'raw'; text: string };

/** Index of the parenthesis that closes the one at `open`, ignoring quotes. */
const closingParen = (s: string, open: number): number => {
    let depth = 0;
    let quote: string | null = null;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
};

const stripOuterParens = (input: string): string => {
    let s = input.trim();
    while (s.startsWith('(') && closingParen(s, 0) === s.length - 1) {
        s = s.slice(1, -1).trim();
    }
    return s;
};

/** `'abc'::character varying` -> `'abc'` */
const stripCast = (s: string): string => {
    let quote: string | null = null;
    for (let i = 0; i < s.length - 1; i++) {
        const ch = s[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') quote = ch;
        else if (ch === ':' && s[i + 1] === ':') return s.slice(0, i).trim();
    }
    return s;
};

/** `'a', 'b', 3` -> ['\'a\'', '\'b\'', '3'] without splitting inside quotes */
const splitTopLevel = (s: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let current = '';
    for (const ch of s) {
        if (quote) {
            current += ch;
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            current += ch;
        } else if (ch === '(' || ch === '[') {
            depth++;
            current += ch;
        } else if (ch === ')' || ch === ']') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim() || parts.length > 0) parts.push(current.trim());
    return parts.filter((p) => p !== '' || parts.length > 1);
};

/** SQL list items to a JSON array, or null when an item is not a plain value */
const listToJson = (items: string[]): string | null => {
    const out: string[] = [];
    for (const raw of items) {
        const item = stripOuterParens(stripCast(raw));
        const str = item.match(/^'((?:[^']|'')*)'$/);
        if (str) out.push(JSON.stringify(str[1].replace(/''/g, "'")));
        else if (NUMBER.test(item)) out.push(item);
        else if (/^(true|false|null)$/i.test(item))
            out.push(item.toLowerCase());
        else return null;
    }
    return `[${out.join(',')}]`;
};

/** A PostgreSQL array literal, '{a,"b c",3}', to a JSON array. */
const arrayLiteralToJson = (text: string, element: Canon): string | null => {
    const inner = text.trim().match(/^\{(.*)\}$/s);
    if (!inner) return null;
    if (inner[1].trim() === '') return '[]';
    const numeric =
        element.kind === 'int' ||
        element.kind === 'decimal' ||
        element.kind === 'float';
    const out: string[] = [];
    for (const part of splitTopLevel(inner[1])) {
        const quoted = part.match(/^"((?:[^"\\]|\\.)*)"$/s);
        const value = quoted ? quoted[1].replace(/\\(.)/g, '$1') : part;
        if (!quoted && /^null$/i.test(value)) out.push('null');
        else if (element.kind === 'bool' && /^(t|true|f|false)$/i.test(value))
            out.push(/^t/i.test(value) ? 'true' : 'false');
        else if (numeric && !quoted && NUMBER.test(value)) out.push(value);
        else out.push(JSON.stringify(value));
    }
    return `[${out.join(',')}]`;
};

const NOW =
    /^(now\(\)|current_timestamp(\(\d*\))?|localtimestamp(\(\d*\))?|getdate\(\)|getutcdate\(\)|sysdatetime\(\)|sysdatetimeoffset\(\)|sysutcdatetime\(\)|transaction_timestamp\(\)|statement_timestamp\(\)|clock_timestamp\(\)|utc_timestamp(\(\d*\))?|datetime\('now'(,'localtime')?\))$/;
const CURRENT_DATE =
    /^(current_date(\(\))?|curdate\(\)|date\('now'\)|cast\(getdate\(\)asdate\)|convert\(date,getdate\(\)\))$/;
const CURRENT_TIME = /^(current_time(\(\d*\))?|curtime\(\)|time\('now'\))$/;
const UUID =
    /^(gen_random_uuid\(\)|uuid_generate_v[1-5]\(\)|uuid\(\)|newid\(\)|newsequentialid\(\))$/;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function parseDefault(raw: string): ParsedDefault {
    let s = stripOuterParens(raw);
    s = stripOuterParens(stripCast(s));
    const lower = s.toLowerCase();
    const compact = lower.replace(/\s+/g, '');
    const quoted = /^[nb]?['"]/i.test(s);

    if (!quoted) {
        if (
            lower.includes('nextval(') ||
            lower.includes('identity') ||
            lower.includes('autoincrement') ||
            lower.includes('auto_increment')
        ) {
            return { kind: 'auto' };
        }
        if (lower === 'null') return { kind: 'null' };
        if (lower === 'true') return { kind: 'bool', value: true };
        if (lower === 'false') return { kind: 'bool', value: false };
        if (NOW.test(compact)) return { kind: 'now' };
        if (CURRENT_DATE.test(compact)) return { kind: 'currentDate' };
        if (CURRENT_TIME.test(compact)) return { kind: 'currentTime' };
        if (UUID.test(compact) || compact.includes('randomblob'))
            return { kind: 'uuid' };
        if (NUMBER.test(s)) return { kind: 'number', text: s };
        if (/^(jsonb?_build_object)\(\)$/.test(compact))
            return { kind: 'string', text: '{}' };
        if (/^(jsonb?_build_array)\(\)$/.test(compact))
            return { kind: 'string', text: '[]' };
        const list = s.match(/^array\s*\[(.*)\]$/is);
        if (list) {
            const json = listToJson(splitTopLevel(list[1]));
            if (json) return { kind: 'array', json };
        }
        return { kind: 'raw', text: raw.trim() };
    }

    const bit = s.match(/^b'([01])'$/i);
    if (bit) return { kind: 'bool', value: bit[1] === '1' };
    const single = s.match(/^n?'((?:[^']|'')*)'$/i);
    if (single) return { kind: 'string', text: single[1].replace(/''/g, "'") };
    const double = s.match(/^"((?:[^"]|"")*)"$/);
    if (double) return { kind: 'string', text: double[1].replace(/""/g, '"') };
    return { kind: 'raw', text: raw.trim() };
}

const TEXTUAL = new Set([
    'char',
    'varchar',
    'text',
    'enum',
    'uuid',
    'json',
    'xml',
]);
const NUMERIC = new Set(['int', 'decimal', 'float']);

const quoteString = (
    text: string,
    canon: Canon,
    target: TargetDialect
): string => {
    if (target === 'mysql')
        return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    const body = `'${text.replace(/'/g, "''")}'`;
    if (target === 'sqlserver') {
        const unicode =
            (canon.kind === 'char' ||
                canon.kind === 'varchar' ||
                canon.kind === 'text') &&
            canon.national
                ? true
                : canon.kind === 'enum' ||
                  canon.kind === 'json' ||
                  canon.kind === 'array';
        return unicode ? `N${body}` : body;
    }
    return body;
};

const boolLiteral = (
    value: boolean,
    canon: Canon,
    target: TargetDialect
): string => {
    if (canon.kind === 'bool')
        return target === 'postgresql'
            ? value
                ? 'true'
                : 'false'
            : value
              ? '1'
              : '0';
    if (NUMERIC.has(canon.kind)) return value ? '1' : '0';
    return quoteString(value ? 'true' : 'false', canon, target);
};

const TRUE_TEXT = new Set(['t', 'true', '1', 'y', 'yes', 'on']);
const FALSE_TEXT = new Set(['f', 'false', '0', 'n', 'no', 'off']);

const SQLITE_UUID =
    "(lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))))";

export interface RenderedDefault {
    sql?: string;
    /** why the default could not be kept */
    note?: string;
}

/** Writes a column default for the target, or says why it cannot. */
export function renderDefault(
    d: ParsedDefault,
    canon: Canon,
    type: RenderedType,
    target: TargetDialect
): RenderedDefault {
    const drop = (why: string): RenderedDefault => ({ note: why });
    // MySQL only takes a literal default on a column that is not TEXT, BLOB, JSON or spatial
    const mysqlWrap = (literal: string) =>
        target === 'mysql' &&
        /^((TINY|MEDIUM|LONG)?(TEXT|BLOB)|JSON|GEOMETRY)\b/i.test(type.sql)
            ? `(${literal})`
            : literal;

    switch (d.kind) {
        case 'auto':
            return {};
        case 'null':
            return { sql: 'NULL' };
        case 'bool':
            return { sql: boolLiteral(d.value, canon, target) };
        case 'number': {
            if (canon.kind === 'bool') {
                return {
                    sql: boolLiteral(Number(d.text) !== 0, canon, target),
                };
            }
            if (
                TEXTUAL.has(canon.kind) ||
                canon.kind === 'date' ||
                canon.kind === 'datetime' ||
                canon.kind === 'time'
            ) {
                return { sql: mysqlWrap(quoteString(d.text, canon, target)) };
            }
            return { sql: d.text };
        }
        case 'string': {
            if (canon.kind === 'array') {
                const json = arrayLiteralToJson(d.text, canon.of);
                if (!json)
                    return drop(
                        `the array default '${d.text}' was not converted`
                    );
                return { sql: mysqlWrap(quoteString(json, canon, target)) };
            }
            if (canon.kind === 'bool') {
                const t = d.text.trim().toLowerCase();
                if (TRUE_TEXT.has(t))
                    return { sql: boolLiteral(true, canon, target) };
                if (FALSE_TEXT.has(t))
                    return { sql: boolLiteral(false, canon, target) };
                return drop(`default '${d.text}' is not a boolean`);
            }
            if (NUMERIC.has(canon.kind)) {
                if (NUMBER.test(d.text.trim())) return { sql: d.text.trim() };
                return drop(`default '${d.text}' is not a number`);
            }
            return { sql: mysqlWrap(quoteString(d.text, canon, target)) };
        }
        case 'now':
        case 'currentDate':
        case 'currentTime': {
            const wants =
                canon.kind === 'datetime' ||
                canon.kind === 'date' ||
                canon.kind === 'time';
            if (!wants) {
                return drop(
                    `the current date and time cannot be the default of a ${canon.kind} column`
                );
            }
            // a date column takes the date, a time column the time, whatever was written
            const what =
                canon.kind === 'date'
                    ? 'currentDate'
                    : canon.kind === 'time'
                      ? 'currentTime'
                      : d.kind;
            switch (target) {
                case 'postgresql':
                    return {
                        sql: {
                            now: 'CURRENT_TIMESTAMP',
                            currentDate: 'CURRENT_DATE',
                            currentTime: 'CURRENT_TIME',
                        }[what],
                    };
                case 'mysql':
                    return {
                        sql: {
                            now: 'CURRENT_TIMESTAMP',
                            currentDate: '(CURRENT_DATE)',
                            currentTime: '(CURRENT_TIME)',
                        }[what],
                    };
                case 'sqlserver':
                    return {
                        sql: {
                            now:
                                canon.kind === 'datetime' && canon.tz
                                    ? 'SYSDATETIMEOFFSET()'
                                    : 'GETDATE()',
                            currentDate: 'CAST(GETDATE() AS DATE)',
                            currentTime: 'CAST(GETDATE() AS TIME)',
                        }[what],
                    };
                case 'sqlite':
                    return {
                        sql: {
                            now: 'CURRENT_TIMESTAMP',
                            currentDate: 'CURRENT_DATE',
                            currentTime: 'CURRENT_TIME',
                        }[what],
                    };
            }
            return {};
        }
        case 'uuid': {
            const fits =
                canon.kind === 'uuid' ||
                canon.kind === 'char' ||
                canon.kind === 'varchar' ||
                canon.kind === 'text';
            if (!fits) {
                return drop(
                    `a generated UUID cannot be the default of a ${canon.kind} column`
                );
            }
            switch (target) {
                case 'postgresql':
                    return { sql: 'gen_random_uuid()' };
                case 'mysql':
                    return { sql: '(UUID())' };
                case 'sqlserver':
                    return {
                        sql:
                            canon.kind === 'uuid'
                                ? 'NEWID()'
                                : 'CONVERT(VARCHAR(36), NEWID())',
                    };
                case 'sqlite':
                    return { sql: SQLITE_UUID };
            }
            return {};
        }
        case 'array': {
            const fits = canon.kind === 'array' || canon.kind === 'json';
            if (!fits)
                return drop(
                    `a list cannot be the default of a ${canon.kind} column`
                );
            return { sql: mysqlWrap(quoteString(d.json, canon, target)) };
        }
        case 'raw':
            return drop(`the default expression ${d.text} was not converted`);
    }
}
