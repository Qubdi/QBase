/**
 * True when a Postgres unique constraint rejected a write (error 23505). Two
 * requests can both pass a "does it exist?" check and then race on the insert;
 * the constraint is what decides, and the loser should get a 409, not a 500.
 * Drizzle wraps the driver error, so the code may be on the error or its cause.
 */
export function isUniqueViolation(err: unknown): boolean {
    for (let e: unknown = err, depth = 0; e && depth < 3; depth++) {
        if (typeof e === 'object' && (e as { code?: unknown }).code === '23505') {
            return true;
        }
        e = (e as { cause?: unknown }).cause;
    }
    return false;
}
