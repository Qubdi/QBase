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

/** Levels of a diagram that are walked one step at a time; below them a subtree is hashed in one go. */
const STEP_DEPTH = 3;
/** Longest the event loop is held while hashing before it is handed back. */
const SLICE_MS = 5;
const FLUSH_CHARS = 1 << 16;

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * `diagramHash`, for a body that may be tens of megabytes: the same bytes go
 * into the same hash, but the walk gives the event loop back every few
 * milliseconds, so one large save does not hold up everyone else for a second.
 */
export async function diagramHashAsync(
    title: string,
    content: unknown
): Promise<string> {
    return (await diagramFingerprintAsync(title, content)).hash;
}

/**
 * The hash of `diagramHashAsync` and, from the same walk, the size in bytes
 * of the content as compact JSON (the keys sorted, `updatedAt` left out, the
 * title included). It is what the size limits are checked against, stored with
 * the diagram so no read has to turn a large jsonb back into text; the text
 * Postgres makes of a jsonb has a space after each `:` and `,`, so it is a
 * little longer than this.
 */
export async function diagramFingerprintAsync(
    title: string,
    content: unknown
): Promise<{ hash: string; bytes: number }> {
    let body = content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        const { updatedAt: _ignored, ...rest } = content as Record<
            string,
            unknown
        >;
        body = rest;
    }
    const hash = createHash('sha256');
    let pending = '';
    let bytes = 0;
    let sliceStart = performance.now();
    const feed = async (text: string) => {
        pending += text;
        if (pending.length < FLUSH_CHARS) return;
        bytes += Buffer.byteLength(pending);
        hash.update(pending);
        pending = '';
        if (performance.now() - sliceStart > SLICE_MS) {
            await nextTurn();
            sliceStart = performance.now();
        }
    };
    // the same text stableStringify gives, written piece by piece
    const walk = async (value: unknown, depth: number): Promise<void> => {
        if (
            value === null ||
            typeof value !== 'object' ||
            depth >= STEP_DEPTH
        ) {
            return feed(stableStringify(value));
        }
        if (Array.isArray(value)) {
            await feed('[');
            for (let i = 0; i < value.length; i++) {
                if (i > 0) await feed(',');
                await walk(value[i], depth + 1);
            }
            return feed(']');
        }
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj)
            .filter((k) => obj[k] !== undefined)
            .sort();
        await feed('{');
        for (let i = 0; i < keys.length; i++) {
            if (i > 0) await feed(',');
            await feed(`${JSON.stringify(keys[i])}:`);
            await walk(obj[keys[i]], depth + 1);
        }
        return feed('}');
    };
    await walk({ title, content: body }, 0);
    bytes += Buffer.byteLength(pending);
    hash.update(pending);
    return { hash: hash.digest('hex'), bytes };
}
