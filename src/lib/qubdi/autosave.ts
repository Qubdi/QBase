export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
    /** Send any unsent change now (also retries after a failure). */
    flush: () => Promise<void>;
    dispose: () => void;
}

/**
 * Debounced saving of a value that changes often. It never sends content that
 * is already saved, never runs two saves at once (a change made while saving
 * is sent right after), and keeps the change pending after a failure so the
 * next flush or edit retries it.
 */
export function createAutosaver<T>(options: AutosaverOptions<T>): Autosaver<T> {
    const { delayMs, save, onStatus, serialize } = options;
    let baseline: string | null = null;
    let latest: { value: T; key: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> | null = null;
    let disposed = false;

    const clear = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    };

    const run = (): Promise<void> => {
        if (running) return running;
        if (!latest || latest.key === baseline) return Promise.resolve();
        const attempt = latest;
        onStatus('saving');
        running = save(attempt.value)
            .then(
                () => {
                    baseline = attempt.key;
                    // edited while saving: send the newer content as well
                    if (latest && latest.key !== baseline) {
                        running = null;
                        return run();
                    }
                    onStatus('saved');
                },
                (error: unknown) => {
                    onStatus('error', error);
                }
            )
            .finally(() => {
                running = null;
            });
        return running;
    };

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
                return;
            }
            clear();
            timer = setTimeout(() => void run(), delayMs);
        },
        flush() {
            clear();
            return run();
        },
        dispose() {
            disposed = true;
            clear();
        },
    };
}
