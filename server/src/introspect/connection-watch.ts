/** What the driver's connection or pool is: something that can emit 'error'. */
interface ErrorSource {
    on(event: 'error', listener: (err: Error) => void): unknown;
}

export class ConnectionLostError extends Error {
    constructor() {
        super('connection lost');
        this.name = 'ConnectionLostError';
    }
}

/**
 * An introspection connection sits open between a request's steps, and the
 * target database can drop it at any moment (a restart, a failover, a
 * firewall). The driver then emits 'error' on the connection itself, and an
 * 'error' event nobody listens to throws and ends the whole process. This
 * listens, logs the reason (the password scrubbed out) and remembers the
 * connection is dead, so the next step fails with a plain error instead.
 */
export function watchConnection(source: ErrorSource, password: string) {
    let lost = false;
    source.on('error', (err) => {
        lost = true;
        let text = err instanceof Error ? err.message : String(err);
        if (password) text = text.split(password).join('***');
        console.error('Introspection connection lost:', text.slice(0, 300));
    });
    return {
        /** Throws when the connection has been dropped. */
        assertAlive() {
            if (lost) throw new ConnectionLostError();
        },
        isLost: () => lost,
    };
}

export type ConnectionWatch = ReturnType<typeof watchConnection>;
