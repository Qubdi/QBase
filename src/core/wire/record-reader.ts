import type { ExtraKeys } from '../model/column';
import type { Warn } from './warning';

export type RawRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is RawRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads typed values out of one JSON object. A key that is missing or `null`
 * counts as not set; a value of the wrong type is skipped with a warning.
 * Every key asked for is remembered as known, so what is left over can be
 * kept as extras.
 */
export class RecordReader {
    private readonly known = new Set<string>();

    constructor(
        readonly raw: RawRecord,
        readonly path: string,
        private readonly warn: Warn
    ) {}

    private fetch(key: string): unknown {
        this.known.add(key);
        const value = this.raw[key];
        return value === null ? undefined : value;
    }

    private bad(key: string, expected: string): undefined {
        this.warn(`${this.path}.${key}`, `expected ${expected}; value ignored`);
        return undefined;
    }

    str(key: string): string | undefined {
        const value = this.fetch(key);
        if (value === undefined) return undefined;
        return typeof value === 'string' ? value : this.bad(key, 'text');
    }

    num(key: string): number | undefined {
        const value = this.fetch(key);
        if (value === undefined) return undefined;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return this.bad(key, 'a number');
    }

    bool(key: string): boolean | undefined {
        const value = this.fetch(key);
        if (value === undefined) return undefined;
        return typeof value === 'boolean'
            ? value
            : this.bad(key, 'true or false');
    }

    /** the raw value, for keys the caller interprets itself */
    any(key: string): unknown {
        return this.fetch(key);
    }

    strings(key: string): string[] | undefined {
        const value = this.fetch(key);
        if (value === undefined) return undefined;
        if (!Array.isArray(value)) return this.bad(key, 'a list of text');
        const out: string[] = [];
        value.forEach((item, i) => {
            if (typeof item === 'string') out.push(item);
            else
                this.warn(
                    `${this.path}.${key}[${i}]`,
                    'expected text; item dropped'
                );
        });
        return out;
    }

    /** the unread keys, or undefined when there are none */
    extras(): ExtraKeys | undefined {
        const out: Record<string, unknown> = {};
        let any = false;
        for (const key of Object.keys(this.raw)) {
            if (!this.known.has(key)) {
                out[key] = this.raw[key];
                any = true;
            }
        }
        return any ? out : undefined;
    }
}
