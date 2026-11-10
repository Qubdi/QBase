/**
 * What a log line may say about a failed request. A Drizzle query error's
 * message carries the whole statement and every value it was run with
 * ("Failed query: ... params: <emails, tokens, diagram content>"), and the
 * driver error under it can repeat a value too ("Key (email)=(...) already
 * exists", "invalid input syntax for type uuid: ..."). Logging the error
 * object would put those values in the log, so only the kind of failure goes
 * in: names, codes, the constraint, and the stack frames.
 */
export interface SafeError {
    name: string;
    message: string;
    code?: string;
    cause?: { name: string; code?: string; constraint?: string; table?: string };
    stack?: string;
}

const text = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : undefined;

const isQueryError = (err: Error): boolean =>
    err.message.startsWith('Failed query:') ||
    err.name === 'DrizzleQueryError' ||
    'params' in err;

/** The frames of a stack, without its first lines, which repeat the message. */
const framesOf = (stack: string | undefined): string | undefined => {
    if (!stack) return undefined;
    const at = stack.indexOf('\n    at ');
    return at === -1 ? undefined : stack.slice(at + 1);
};

export function safeError(err: unknown): SafeError {
    if (!(err instanceof Error)) {
        return { name: 'NonError', message: 'a value that is not an Error was thrown' };
    }
    const cause = (err as { cause?: unknown }).cause;
    const causeFields =
        cause instanceof Error
            ? {
                  name: cause.name,
                  code: text((cause as { code?: unknown }).code),
                  constraint: text((cause as { constraint?: unknown }).constraint),
                  table: text((cause as { table?: unknown }).table),
              }
            : undefined;
    // a query error's message is the statement and its values: only say what kind it was
    const message = isQueryError(err)
        ? `database query failed${causeFields?.code ? ` (${causeFields.code})` : ''}`
        : err.message;
    return {
        name: err.name,
        message,
        code: text((err as { code?: unknown }).code),
        ...(causeFields ? { cause: causeFields } : {}),
        stack: framesOf(err.stack),
    };
}
