import { Parser } from 'node-sql-parser';

/** Text of a base64 view definition: UTF-8, or UTF-16LE for SQL Server. */
export function decodeDefinition(base64: string, utf16: boolean): string {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder(utf16 ? 'utf-16le' : 'utf-8').decode(bytes);
}

export interface TableRef {
    schema?: string;
    name: string;
}

const parser = new Parser();

/** MySQL quoting and the bracket form are rewritten so the PostgreSQL grammar can read them. */
function lightRewrite(sql: string): string {
    return sql.replace(/`/g, '"').replace(/\[([^\]]+)\]/g, '"$1"');
}

/** The SELECT part of `CREATE [MATERIALIZED] VIEW name AS SELECT ...`. */
function selectPart(definition: string): string {
    const m = /\bAS\b\s*(?=\(?\s*(?:WITH|SELECT)\b)/i.exec(definition);
    return m ? definition.slice(m.index + m[0].length) : definition;
}

/** Fallback: names that follow FROM or JOIN. */
function scanned(sql: string): TableRef[] {
    const out: TableRef[] = [];
    const re =
        /\b(?:FROM|JOIN)\s+("[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*("[^"]+"|[A-Za-z_][\w$]*))?/gi;
    for (let m = re.exec(sql); m; m = re.exec(sql)) {
        const clean = (t: string): string => t.replace(/^"|"$/g, '');
        out.push(
            m[2]
                ? { schema: clean(m[1]), name: clean(m[2]) }
                : { name: clean(m[1]) }
        );
    }
    return out;
}

/** Tables a view definition reads from; an unreadable definition gives none. */
export function tablesReadBy(definition: string): TableRef[] {
    const sql = selectPart(lightRewrite(definition)).replace(/;\s*$/, '');
    try {
        const list = parser.tableList(sql, { database: 'PostgresQL' });
        return list
            .map((entry) => entry.split('::'))
            .filter((p) => p.length === 3)
            .map(([, schema, name]) => ({
                schema: schema === 'null' ? undefined : schema,
                name,
            }));
    } catch {
        return scanned(sql);
    }
}
