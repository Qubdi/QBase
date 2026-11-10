/** How long the editor waits after the last change before saving to the server. */
export const AUTOSAVE_DELAY_MS = 10_000;

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
// a server that asks for a long wait is obeyed, up to this
const RETRY_AFTER_MAX_MS = 5 * 60_000;

/**
 * How long to wait before sending a failed save again, or null when waiting
 * cannot help (the server refused it: 4xx other than 429). A network failure
 * has no status. Exponential from 2 s to 1 min with jitter; a Retry-After the
 * server sent is honoured when it asks for longer.
 */
export function retryDelayMs(
    error: unknown,
    attempt: number,
    random: () => number = Math.random
): number | null {
    const { status, retryAfterMs } = (error ?? {}) as {
        status?: unknown;
        retryAfterMs?: unknown;
    };
    if (typeof status === 'number' && status !== 429 && status < 500) {
        return null;
    }
    const backoff = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1)
    );
    const jittered = backoff * (0.5 + random() / 2);
    const asked =
        typeof retryAfterMs === 'number'
            ? Math.min(RETRY_AFTER_MAX_MS, retryAfterMs)
            : 0;
    return Math.max(jittered, asked);
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaverOptions<T> {
    /** How long edits must pause before they are sent. */
    delayMs: number;
    save: (value: T) => Promise<void>;
    onStatus: (status: SaveStatus, error?: unknown) => void;
    /** Two values with the same key are the same content. */
    serialize: (value: T) => string;
}

export interface Autosaver<T> {
    /** Report the current value. The first one only sets the baseline. */
    update: (value: T) => void;
    /**
     * The value reported first turned out not to be on the server: treat it as
     * an unsent change and save it after the usual pause.
     */
    markUnsaved: () => void;
    /** Send any unsent change now (also retries after a failure). */
    flush: () => Promise<void>;
    /**
     * Forget every unsent change and stop saving (the user threw them away).
     * Resolves once a save already on its way has settled, so the caller can
     * be sure nothing of the discarded work is still travelling; never rejects.
     */
    discard: () => Promise<void>;
    dispose: () => void;
}

/**
 * Debounced saving of a value that changes often. It never sends content that
 * is already saved, never runs two saves at once (a change made while saving
 * is sent right after), and keeps the change pending after a failure. A
 * failure that waiting can fix (network, 429, 5xx) is retried by itself with
 * backoff; the next flush, edit or return of the connection retries at once.
 */
export function createAutosaver<T>(options: AutosaverOptions<T>): Autosaver<T> {
    const { delayMs, save, onStatus, serialize } = options;
    let baseline: string | null = null;
    let latest: { value: T; key: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> | null = null;
    let disposed = false;
    let pending = false;
    // the last save failed and nothing has retried it since
    let failed = false;
    // failures in a row, for the retry backoff
    let failures = 0;

    const clear = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };

    const schedule = (ms: number) => {
        timer = setTimeout(() => {
            timer = undefined;
            void run();
        }, ms);
    };

    const run = (): Promise<void> => {
        if (running) return running;
        if (!latest || latest.key === baseline) return Promise.resolve();
        const attempt = latest;
        pending = false;
        failed = false;
        onStatus('saving');
        running = save(attempt.value)
            .then(
                () => {
                    baseline = attempt.key;
                    failures = 0;
                    // edited while saving: send the newer content as well
                    if (latest && latest.key !== baseline) {
                        running = null;
                        return run();
                    }
                    onStatus('saved');
                },
                (error: unknown) => {
                    failed = true;
                    failures++;
                    onStatus('error', error);
                    // an edit made meanwhile has its own timer; keep that one
                    const wait = retryDelayMs(error, failures);
                    if (wait !== null && !disposed && timer === undefined) {
                        schedule(wait);
                    }
                }
            )
            .finally(() => {
                running = null;
            });
        return running;
    };

    // a save that failed because the connection dropped is retried when it is back
    const onOnline = () => {
        if (failed && !disposed) {
            clear();
            failures = 0;
            void run();
        }
    };
    const stopListening = () => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', onOnline);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('online', onOnline);
    }

    return {
        update(value) {
            if (disposed) return;
            const key = serialize(value);
            latest = { value, key };
            if (baseline === null) {
                baseline = key;
                return;
            }
            if (key === baseline) {
                clear();
                // edits that were undone: nothing is waiting any more
                if (pending) {
                    pending = false;
                    onStatus('saved');
                }
                return;
            }
            clear();
            // tell the user there is something to save while we wait
            if (!pending) {
                pending = true;
                onStatus('pending');
            }
            schedule(delayMs);
        },
        markUnsaved() {
            if (disposed || !latest || pending) return;
            // a key no value can have, so the value is never "already saved"
            baseline = '';
            pending = true;
            onStatus('pending');
            clear();
            schedule(delayMs);
        },
        flush() {
            clear();
            return run();
        },
        discard() {
            disposed = true;
            latest = null;
            pending = false;
            clear();
            stopListening();
            return running ?? Promise.resolve();
        },
        dispose() {
            disposed = true;
            clear();
            stopListening();
        },
    };
}
