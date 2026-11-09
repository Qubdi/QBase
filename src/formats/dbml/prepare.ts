/** Things QBase accepts in DBML that the parser does not know (IMP-047, IMP-048). */

export interface Prepared {
    text: string;
    /** `table.field` keys of fields written with a `[]` type */
    arrayFields: Map<string, { line: number; column: number; written: string }>;
    /** field-level check expressions by `table.field` */
    fieldChecks: Map<
        string,
        { expression: string; line: number; column: number }[]
    >;
}

const TABLE_LINE =
    /^\s*Table\s+(?:"((?:[^"]|\\")*)"|([\w]+))(?:\s*\.\s*(?:"((?:[^"]|\\")*)"|([\w]+)))?/i;
const FIELD_LINE =
    /^(\s*)("(?:[^"\\]|\\.)*"|[\w$]+)(\s+)([^\s[]+(?:\([^)]*\))?)(\[\])?(.*)$/;

const unquote = (s: string): string => s.replace(/^"|"$/g, '');

/**
 * The change in brace depth over one line, ignoring braces inside strings,
 * backtick expressions, `'''` notes (which can span lines) and `//` comments.
 */
function countBraces(
    line: string,
    startsInTriple: boolean
): { delta: number; inTriple: boolean } {
    let delta = 0;
    let inTriple = startsInTriple;
    let quote = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inTriple) {
            if (line.startsWith("'''", i)) {
                inTriple = false;
                i += 2;
            }
            continue;
        }
        if (quote) {
            if (ch === '\\') i++;
            else if (ch === quote) quote = '';
            continue;
        }
        if (line.startsWith("'''", i)) {
            inTriple = true;
            i += 2;
        } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
        else if (ch === '/' && line[i + 1] === '/') break;
        else if (ch === '{') delta++;
        else if (ch === '}') delta--;
    }
    return { delta, inTriple };
}

/**
 * Removes `[]` from array types and `check:` settings from fields, and
 * remembers both. Line numbers are kept: nothing is removed across lines.
 */
export function prepareDbml(source: string): Prepared {
    const arrayFields: Prepared['arrayFields'] = new Map();
    const fieldChecks: Prepared['fieldChecks'] = new Map();
    let table = '';
    let depth = 0;
    let inTriple = false;
    const lines = source.split(/\r?\n/).map((line, index) => {
        const header = TABLE_LINE.exec(line);
        if (header && depth === 0) {
            const first = header[1] ?? header[2];
            const second = header[3] ?? header[4];
            table = second ?? first;
        }
        let out = line;
        if (depth === 1 && table) {
            const m = FIELD_LINE.exec(line);
            if (m && !/^(?:Note|Indexes|checks)\b/i.test(unquote(m[2]))) {
                const field = unquote(m[2]);
                const key = `${table}.${field}`;
                if (m[5]) {
                    arrayFields.set(key, {
                        line: index + 1,
                        column:
                            m[1].length +
                            m[2].length +
                            m[3].length +
                            m[4].length +
                            1,
                        written: `${m[4]}[]`,
                    });
                    out = `${m[1]}${m[2]}${m[3]}${m[4]}${m[6]}`;
                }
                const settings = /\bcheck:\s*`([^`]*)`\s*,?\s*/.exec(out);
                if (settings) {
                    const list = fieldChecks.get(key) ?? [];
                    list.push({
                        expression: settings[1],
                        line: index + 1,
                        column: settings.index + 1,
                    });
                    fieldChecks.set(key, list);
                    out = out
                        .replace(settings[0], '')
                        .replace(/\[\s*,\s*/, '[')
                        .replace(/,\s*\]/, ']')
                        .replace(/\[\s*\]/, '');
                }
            }
        }
        const scanned = countBraces(line, inTriple);
        inTriple = scanned.inTriple;
        depth = Math.max(0, depth + scanned.delta);
        return out;
    });
    return { text: lines.join('\n'), arrayFields, fieldChecks };
}
