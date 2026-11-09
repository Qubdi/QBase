export interface ShutdownDeps {
    stopMaintenance: () => Promise<void>;
    /** the connection that listens for other replicas' events */
    stopEvents?: () => Promise<void>;
    closeApp: () => Promise<unknown>;
    closePool: () => Promise<unknown>;
    exit: (code: number) => void;
    log?: (message: string) => void;
    logError?: (message: string, err: unknown) => void;
    /** a stuck request must not keep the process alive for ever */
    forceAfterMs?: number;
}

/**
 * The handler for SIGTERM and SIGINT: finish what is running, close the
 * streams, then release the database connections. Runs once however many
 * signals arrive; exits 0 when everything closed and 1 when a step failed or
 * took longer than `forceAfterMs`. `crashed` is for an error nobody handled:
 * the same orderly close, but the exit code stays 1.
 */
export function createShutdown(deps: ShutdownDeps) {
    const {
        stopMaintenance,
        stopEvents,
        closeApp,
        closePool,
        exit,
        log = console.log,
        logError = console.error,
        forceAfterMs = 10_000,
    } = deps;
    let stopping = false;
    return async (signal: string, crashed = false) => {
        if (stopping) return;
        stopping = true;
        log(`${signal} received, shutting down`);
        setTimeout(() => exit(1), forceAfterMs).unref();
        try {
            // together, not one after the other: a long clean-up pass must not
            // keep the server taking and holding requests while it finishes,
            // and both finish before the pool they use is closed
            await Promise.all([stopMaintenance(), closeApp()]);
            await stopEvents?.();
            await closePool();
            exit(crashed ? 1 : 0);
        } catch (err) {
            logError('Shutdown failed:', err);
            exit(1);
        }
    };
}
