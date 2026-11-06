import { unwrapOnce } from '../shared/defaults';
import type { Flavour, Neutral } from './contract';

type Parsed =
    | { k: 'now' | 'date' | 'time' | 'uuid' | 'null' | 'numbering' }
    | { k: 'bool'; v: boolean }
    | { k: 'number'; v: string }
    | { k: 'string'; v: string }
    | { k: 'list'; v: string }
    | { k: 'raw' };

const NOW =
    /^(?:now\(\)|current_timestamp(?:\(\d*\))?|localtimestamp|getdate\(\)|sysdatetime\(\)|sysdatetimeoffset\(\)|utc_timestamp(?:\(\))?|datetime\(\s*'now'\s*\))$/i;
const UUID =
    /^(?:gen_random_uuid\(\)|uuid_generate_v[1-5]\(\)|uuid\(\)|newid\(\)|newsequentialid\(\)|lower\(hex\(randomblob\(16\)\)\))$/i;

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
    if (/^nextval\(|identity|autoincrement/i.test(text))
        return { k: 'numbering' };
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
    if (/^ARRAY\s*\[/i.test(text))
        return {
            k: 'list',
            v: text.replace(/^ARRAY\s*/i, '').replace(/'/g, '"'),
        };
    return { k: 'raw' };
}

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

/** A default written for the target, or dropped with a reason. */
export function convertDefault(
    raw: string,
    neutral: Neutral,
    target: Flavour
): DefaultOut {
    const d = parse(raw);
    const isMy = target === 'mysql';
    const isMs = target === 'sqlserver';
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
            return wrap(textual ? `'${d.v}'` : d.v);
        case 'string': {
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
            if (isMs) return { text: 'CAST(GETDATE() AS TIME)' };
            return { text: isMy ? '(CURRENT_TIME)' : 'CURRENT_TIME' };
        case 'uuid':
            if (target === 'postgres') return { text: 'gen_random_uuid()' };
            if (isMy) return { text: '(UUID())' };
            if (isMs)
                return {
                    text: textual ? 'CONVERT(VARCHAR(36), NEWID())' : 'NEWID()',
                };
            return { text: SQLITE_UUID };
        case 'list':
            if (neutral.kind === 'array' && target === 'postgres')
                return { text: `'{${d.v.slice(1, -1).replace(/"/g, '')}}'` };
            if (neutral.kind === 'array' || neutral.kind === 'json')
                return wrap(`'${d.v.replace(/'/g, "''")}'`);
            return drop('a list on a column that is not a list');
        case 'raw':
            return drop('not understood');
    }
}
