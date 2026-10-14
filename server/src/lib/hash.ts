import { createHash } from 'node:crypto';

/** JSON with object keys sorted recursively, so key order never changes the hash. */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
    return `{${keys
        .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
        .join(',')}}`;
}

/**
 * Hash of a diagram's meaningful state. The top-level `updatedAt` is ignored:
 * a bare timestamp bump is not a change worth publishing.
 */
export function diagramHash(title: string, content: unknown): string {
    let body = content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        const { updatedAt: _ignored, ...rest } = content as Record<
            string,
            unknown
        >;
        body = rest;
    }
    return createHash('sha256')
        .update(stableStringify({ title, content: body }))
        .digest('hex');
}
