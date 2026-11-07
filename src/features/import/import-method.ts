import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';

/** The three ways text can be brought in (spec import-export section 2). */
export type ImportMethod = 'metadata' | 'sql' | 'dbml';

export const ALL_METHODS: readonly ImportMethod[] = ['metadata', 'sql', 'dbml'];

/**
 * A pasted text that clearly belongs to another method (spec 3.3): DBML
 * keywords, then SQL statements, then a JSON document. Undefined when the
 * text gives no clear hint.
 */
export function methodForPaste(text: string): ImportMethod | undefined {
    const dbml =
        /^\s*(?:Table\s+\S|Ref\s*[:\s]|Enum\s+\S|TableGroup\b|Note\s+\S+\s*\{)/im;
    if (
        dbml.test(text) ||
        /\[\s*pk\s*\]/i.test(text) ||
        /\[\s*ref\s*:\s*[<>-]/i.test(text)
    )
        return 'dbml';
    if (
        /\b(?:CREATE|ALTER|DROP)\s+TABLE\b|\bCREATE\s+(?:UNIQUE\s+)?(?:INDEX|VIEW|PROCEDURE|FUNCTION|SCHEMA|DATABASE)\b/i.test(
            text
        )
    )
        return 'sql';
    const trimmed = text.trim();
    if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
        return 'metadata';
    return undefined;
}

const PRETTY_LIMIT = 2 * 1024 * 1024;

/** Pretty prints JSON under 2 MB; anything else comes back unchanged. */
export function prettyJson(text: string): string {
    if (text.length >= PRETTY_LIMIT) return text;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

/**
 * Which methods a database accepts: SQL needs a reader, and databases without
 * one (the open-only ones) get no import at all.
 */
export function methodsFor(
    type: DatabaseType,
    allowed: readonly ImportMethod[] = ALL_METHODS
): ImportMethod[] {
    const dialect = dialectFor(type);
    return allowed.filter(
        (m) => m !== 'sql' || type === 'generic' || dialect.sql.read
    );
}
