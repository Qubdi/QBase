/** True when the error, or its cause, carries the given Postgres error code. */
function hasPgCode(err: unknown, code: string): boolean {
    for (let e: unknown = err, depth = 0; e && depth < 3; depth++) {
        if (typeof e === 'object' && (e as { code?: unknown }).code === code) {
            return true;
        }
        e = (e as { cause?: unknown }).cause;
    }
    return false;
}

/**
 * True when a Postgres unique constraint rejected a write (error 23505). Two
 * requests can both pass a "does it exist?" check and then race on the insert;
 * the constraint is what decides, and the loser should get a 409, not a 500.
 * Drizzle wraps the driver error, so the code may be on the error or its cause.
 */
export function isUniqueViolation(err: unknown): boolean {
    return hasPgCode(err, '23505');
}

/**
 * True when a foreign key rejected a write: a row that was checked as
 * unreferenced gained a reference before the delete ran. Postgres reports
 * 23001 for `on delete restrict` and 23503 for the other rules.
 */
export function isForeignKeyViolation(err: unknown): boolean {
    return hasPgCode(err, '23503') || hasPgCode(err, '23001');
}

/**
 * True when Postgres refused text it cannot store: a NUL character in text
 * ("invalid byte sequence for encoding UTF8: 0x00", 22021) or in jsonb
 * ("unsupported Unicode escape sequence", 22P05). That is the caller's own
 * input, so it answers 400, not a server failure.
 */
export function isUnstorableText(err: unknown): boolean {
    return hasPgCode(err, '22021') || hasPgCode(err, '22P05');
}
