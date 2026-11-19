import { isNumberingMarker, unwrapOnce } from '../shared/defaults';
import type { Flavour, Neutral } from './contract';

/** One element of `ARRAY[...]`: a number is written bare, anything else as text. */
interface ListItem {
    text: string;
    number: boolean;
}

type Parsed =
    | { k: 'now' | 'date' | 'time' | 'uuid' | 'null' | 'numbering' }
    | { k: 'bool'; v: boolean }
    | { k: 'number'; v: string }
    | { k: 'string'; v: string }
    | { k: 'list'; items: ListItem[] }
    | { k: 'raw' };

const NOW =
    /^(?:now\(\)|current_timestamp(?:\(\d*\))?|localtimestamp|getdate\(\)|sysdatetime\(\)|sysdatetimeoffset\(\)|sysdate|systimestamp|utc_timestamp(?:\(\))?|datetime\(\s*'now'\s*\))$/i;
const UUID =
    /^(?:gen_random_uuid\(\)|uuid_generate_v[1-5]\(\)|uuid\(\)|newid\(\)|newsequentialid\(\)|sys_guid\(\)|lower\(hex\(randomblob\(16\)\)\))$/i;

/** Reads a default in the source's way (EXP-043). */
function parse(raw: string): Parsed {
    let text = raw.trim();
    for (
        let inner = unwrapOnce(text);
        inner !== undefined;
        inner = unwrapOnce(text)
    )
        text = inner;
    const cast =
        /^(?:CAST\()?('(?:[^']|'')*'|[-\w.]+)(?:\s*::\s*[\w\s."]+(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])?|\s+AS\s+[\w\s]+(?:\(\d+(?:,\s*\d+)?\))?\))$/i.exec(
            text
        );
    if (cast) text = cast[1];
    if (isNumberingMarker(text)) return { k: 'numbering' };
    if (/^null$/i.test(text)) return { k: 'null' };
    if (/^true$/i.test(text)) return { k: 'bool', v: true };
    if (/^false$/i.test(text)) return { k: 'bool', v: false };
    if (NOW.test(text)) return { k: 'now' };
    if (/^(?:current_date|curdate\(\))$/i.test(text)) return { k: 'date' };
    if (/^(?:current_time(?:\(\d*\))?|curtime\(\))$/i.test(text))
        return { k: 'time' };
    if (UUID.test(text)) return { k: 'uuid' };
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return { k: 'number', v: text };
    const str = /^(?:N)?'((?:[^']|'')*)'$/is.exec(text);
    if (str) return { k: 'string', v: str[1].replace(/''/g, "'") };
    if (/^ARRAY\s*\[/i.test(text)) {
        const items = arrayItems(text);
        if (items) return { k: 'list', items };
    }
    return { k: 'raw' };
}

/**
 * The elements of `ARRAY['a', 'it''s', 3]`, with a trailing `::type[]` cast
 * ignored; undefined when the text is not a plain list of literals.
 */
function arrayItems(text: string): ListItem[] | undefined {
    const body =
        /^ARRAY\s*\[(.*?)\]\s*(?:::\s*[\w\s."]+(?:\(\d+(?:,\s*\d+)?\))?(?:\[\])*)?$/is.exec(
            text
        );
    if (!body) return undefined;
    const parts: string[] = [];
    let current = '';
    let quoted = false;
    const inner = body[1];
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "'") {
            // a doubled quote inside a string is one quote
            if (quoted && inner[i + 1] === "'") {
                current += "''";
                i++;
                continue;
            }
            quoted = !quoted;
        }
        if (ch === ',' && !quoted) {
            parts.push(current);
            current = '';
        } else current += ch;
    }
    if (quoted) return undefined;
    parts.push(current);
    const items: ListItem[] = [];
    for (const raw of parts) {
        const part = raw.trim();
        if (part === '') continue;
        const str = /^'((?:[^']|'')*)'(?:\s*::\s*[\w\s."]+)?$/s.exec(part);
        if (str)
            items.push({ text: str[1].replace(/''/g, "'"), number: false });
        else if (/^-?\d+(?:\.\d+)?$/.test(part))
            items.push({ text: part, number: true });
        else return undefined;
    }
    return items;
}

/** The list as JSON text: `["a", "it's", 3]`. */
const listAsJson = (items: ListItem[]): string =>
    `[${items.map((i) => (i.number ? i.text : JSON.stringify(i.text))).join(', ')}]`;

/** The list as a PostgreSQL array literal body: `{a,"it's",3}`. */
const listAsPgArray = (items: ListItem[]): string =>
    `{${items
        .map((i) =>
            i.number || /^[\w.-]+$/.test(i.text)
                ? i.text
                : `"${i.text.replace(/[\\"]/g, '\\$&')}"`
        )
        .join(',')}}`;

export interface DefaultOut {
    text?: string;
    note?: string;
}

const SQLITE_UUID =
    "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))";

const isTextual = (n: Neutral): boolean =>
    n.kind === 'char' ||
    n.kind === 'varchar' ||
    n.kind === 'text' ||
    n.kind === 'enum';

/**
 * The elements of the inside of a PostgreSQL array literal (`a,"b,c",d`):
 * a double-quoted element may hold commas, and a backslash takes the next
 * character as it is. Blank unquoted elements are skipped.
 */
function pgArrayElements(body: string): { text: string; quoted: boolean }[] {
    const out: { text: string; quoted: boolean }[] = [];
    let text = '';
    let quoted = false;
    let inQuotes = false;
    const end = () => {
        const value = quoted ? text : text.trim();
        if (quoted || value !== '') out.push({ text: value, quoted });
        text = '';
        quoted = false;
    };
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch === '\\' && i + 1 < body.length) {
            text += body[++i];
        } else if (ch === '"') {
            inQuotes = !inQuotes;
            quoted = true;
        } else if (ch === ',' && !inQuotes) end();
        else if (inQuotes || quoted || ch !== ' ' || text !== '') text += ch;
    }
    end();
    return out;
}

/** A default written for the target, or dropped with a reason. */
export function convertDefault(
    raw: string,
    neutral: Neutral,
    target: Flavour
): DefaultOut {
    const d = parse(raw);
    const isMy = target === 'mysql';
    const isMs = target === 'sqlserver';
    const isOr = target === 'oracle';
    const textual = isTextual(neutral);
    const national =
        (neutral.kind === 'char' || neutral.kind === 'varchar') &&
        !!neutral.national;
    const drop = (why: string): DefaultOut => ({
        note: `the default expression ${raw.trim()} was not converted (${why})`,
    });
    const wrap = (value: string): DefaultOut => ({
        text:
            isMy &&
            (neutral.kind === 'text' ||
                neutral.kind === 'blob' ||
                neutral.kind === 'json' ||
                neutral.kind === 'geo' ||
                neutral.kind === 'array')
                ? `(${value})`
                : value,
    });
    switch (d.k) {
        case 'numbering':
            return {};
        case 'null':
            return { text: 'NULL' };
        case 'bool':
            if (neutral.kind !== 'bool' && !textual && neutral.kind !== 'int')
                return drop('a boolean on a column that is not boolean');
            return {
                text:
                    target === 'postgres' && neutral.kind === 'bool'
                        ? String(d.v)
                        : d.v
                          ? '1'
                          : '0',
            };
        case 'number':
            if (
                neutral.kind === 'date' ||
                neutral.kind === 'datetime' ||
                neutral.kind === 'time'
            )
                return drop('a number on a date column');
            // PostgreSQL takes only true and false for a boolean column
            if (neutral.kind === 'bool' && target === 'postgres')
                return d.v === '1' || d.v === '0'
                    ? { text: d.v === '1' ? 'true' : 'false' }
                    : drop('a number that is not 0 or 1 on a boolean column');
            return wrap(textual ? `'${d.v}'` : d.v);
        case 'string': {
            if (
                neutral.kind === 'array' &&
                target !== 'postgres' &&
                /^\{.*\}$/s.test(d.v)
            ) {
                const items = pgArrayElements(d.v.slice(1, -1)).map((x) =>
                    !x.quoted && /^-?\d+(\.\d+)?$/.test(x.text)
                        ? x.text
                        : JSON.stringify(x.text)
                );
                // the JSON text sits inside a quoted literal of the target
                const json = `[${items.join(', ')}]`.replace(/'/g, "''");
                return wrap(`'${isMy ? json.replace(/\\/g, '\\\\') : json}'`);
            }
            const body = d.v.replace(/'/g, "''");
            const text = isMy ? body.replace(/\\/g, '\\\\') : body;
            return wrap(isMs && national ? `N'${text}'` : `'${text}'`);
        }
        case 'now':
            if (
                neutral.kind === 'int' ||
                neutral.kind === 'decimal' ||
                neutral.kind === 'float' ||
                neutral.kind === 'bool'
            )
                return drop('a date function on a number column');
            if (isOr) return { text: 'CURRENT_TIMESTAMP' };
            if (isMs)
                return {
                    text:
                        neutral.kind === 'datetime' && neutral.zone
                            ? 'SYSDATETIMEOFFSET()'
                            : 'GETDATE()',
                };
            return { text: 'CURRENT_TIMESTAMP' };
        case 'date':
            if (isMs) return { text: 'CAST(GETDATE() AS DATE)' };
            return { text: isMy ? '(CURRENT_DATE)' : 'CURRENT_DATE' };
        case 'time':
            if (isOr) return { text: 'CURRENT_TIMESTAMP' };
            if (isMs) return { text: 'CAST(GETDATE() AS TIME)' };
            return { text: isMy ? '(CURRENT_TIME)' : 'CURRENT_TIME' };
        case 'uuid':
            if (neutral.kind !== 'uuid' && !textual)
                return drop('a uuid function on a column that is not a uuid');
            if (target === 'postgres') return { text: 'gen_random_uuid()' };
            if (isMy) return { text: '(UUID())' };
            if (isOr)
                return {
                    text: textual ? 'RAWTOHEX(SYS_GUID())' : 'SYS_GUID()',
                };
            if (isMs)
                return {
                    text: textual ? 'CONVERT(VARCHAR(36), NEWID())' : 'NEWID()',
                };
            return { text: SQLITE_UUID };
        case 'list':
            if (neutral.kind === 'array' && target === 'postgres')
                return {
                    text: `'${listAsPgArray(d.items).replace(/'/g, "''")}'`,
                };
            if (neutral.kind === 'array' || neutral.kind === 'json')
                return wrap(`'${listAsJson(d.items).replace(/'/g, "''")}'`);
            return drop('a list on a column that is not a list');
        case 'raw':
            return drop('not understood');
    }
}
