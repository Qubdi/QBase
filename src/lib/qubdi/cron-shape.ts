/**
 * Cheap client-side check that a schedule has the 5 cron fields. The server
 * does the real validation; this only catches obvious typos before saving.
 */
export const isValidCronShape = (expr: string): boolean =>
    /^\S+(\s+\S+){4}$/.test(expr.trim());
