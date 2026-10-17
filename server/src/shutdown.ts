export interface ShutdownDeps {
    stopMaintenance: () => Promise<void>;
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
 * took longer than `forceAfterMs`.
 */
export function createShutdown(deps: ShutdownDeps) {
    const {
        stopMaintenance,
        closeApp,
        closePool,
        exit,
        log = console.log,
        logError = console.error,
        forceAfterMs = 10_000,
    } = deps;
    let stopping = false;
    return async (signal: string) => {
        if (stopping) return;
        stopping = true;
        log(`${signal} received, shutting down`);
        setTimeout(() => exit(1), forceAfterMs).unref();
        try {
            await stopMaintenance();
            await closeApp();
            await closePool();
            exit(0);
        } catch (err) {
            logError('Shutdown failed:', err);
            exit(1);
        }
    };
}
