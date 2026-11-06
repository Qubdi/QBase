import { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';

export const INVALID_JSON_MESSAGE =
    'Invalid JSON. Please correct it or contact us at support@qubdi.dev for help.';

export type ParsedMetadata =
    { ok: true; metadata: DatabaseMetadata } | { ok: false; message: string };

/** Reads pasted text as metadata, or says why not. */
export function parseMetadataText(text: string): ParsedMetadata {
    if (!text.includes('{') || !text.includes('}'))
        return { ok: false, message: INVALID_JSON_MESSAGE };
    try {
        const result = DatabaseMetadata.safeParse(JSON.parse(text));
        if (result.success) return { ok: true, metadata: result.data };
    } catch {
        /* fall through */
    }
    return { ok: false, message: INVALID_JSON_MESSAGE };
}

/** The object inside `[{"metadata_json_to_import": "{...}"}]`, found by counting braces. */
function unwrap(text: string): string {
    const key = text.indexOf('metadata_json_to_import');
    if (key < 0) return text;
    const start = text.indexOf('{', text.indexOf(':', key));
    if (start < 0) return text;
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' && text[i - 1] !== '\\') inString = !inString;
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    return text;
}

function attempt(text: string): string | undefined {
    try {
        JSON.parse(text);
        return text;
    } catch {
        return undefined;
    }
}

/**
 * One repair pass for mangled pasted text (IMP-057), in the order of the
 * spec: cut to the outer braces, strip terminal decoration, trailing and
 * leading commas, text-typed values, CSV doubling, wrapper object, JSON string.
 */
export function repairMetadataText(input: string): string {
    let text = input.trim();
    // a JSON string holding the document
    if (text.startsWith('"') && text.endsWith('"')) {
        const inner = attempt(text);
        if (inner !== undefined) {
            const value = JSON.parse(inner);
            if (typeof value === 'string') text = value;
        }
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
    if (
        attempt(text) !== undefined &&
        !text.includes('metadata_json_to_import')
    )
        return text;

    text = text.replace(/[\r\n←-⇿─-╿]/g, '');
    // CSV exports double every quote
    if (/""[a-z_]+""\s*:/.test(text)) text = text.replace(/""/g, '"');
    text = unwrap(text);
    text = text
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\[\s*,/g, '[')
        .replace(/"precision"\s*:\s*"null"/g, '"precision": null')
        .replace(/"nullable"\s*:\s*"false"/g, '"nullable": false')
        .replace(/"nullable"\s*:\s*"true"/g, '"nullable": true')
        .replace(/"default"\s*:\s*"\{[^"]*\}"/g, '"default": null');
    // an escaped copy of the document: \" becomes "
    if (attempt(text) === undefined && text.includes('\\"'))
        text = text.replace(/\\"/g, '"');
    return text;
}

/** The selection of tables to keep: `schema.table` keys (IMP-064). */
export function selectMetadata(
    metadata: DatabaseMetadata,
    selected: ReadonlySet<string>
): DatabaseMetadata {
    const has = (schema: string, name: string): boolean =>
        selected.has(`${schema}.${name}`);
    const schemas = new Set<string>();
    for (const t of metadata.tables)
        if (has(t.schema, t.table)) schemas.add(t.schema);
    for (const v of metadata.views)
        if (has(v.schema, v.view_name)) schemas.add(v.schema);
    const usedTypes = new Set(
        metadata.columns
            .filter((c) => has(c.schema, c.table))
            .map((c) => c.type)
    );
    return {
        ...metadata,
        tables: metadata.tables.filter((t) => has(t.schema, t.table)),
        views: metadata.views.filter((v) => has(v.schema, v.view_name)),
        columns: metadata.columns.filter((c) => has(c.schema, c.table)),
        pk_info: metadata.pk_info.filter((p) => has(p.schema, p.table)),
        indexes: metadata.indexes.filter((i) => has(i.schema, i.table)),
        check_constraints: metadata.check_constraints?.filter((c) =>
            has(c.schema, c.table)
        ),
        fk_info: metadata.fk_info.filter(
            (f) =>
                has(f.schema, f.table) ||
                has(f.reference_schema ?? f.schema, f.reference_table)
        ),
        custom_types: metadata.custom_types?.filter(
            (t) => schemas.has(t.schema) || usedTypes.has(t.type)
        ),
    };
}
