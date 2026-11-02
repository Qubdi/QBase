import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/** The Postgres channel the replicas tell each other about publishes on. */
export const EVENTS_CHANNEL = 'qubdi_events';

export type PublishListener = (diagramId: string, version: number) => void;
export type LinkListener = (linkId: string) => void;

type Wire =
    | { o: string; t: 'publish'; d: string; v: number }
    | { o: string; t: 'link'; l: string };

// `Omit` on a union would merge its members' keys away
type DistributiveOmit<T, K extends string> = T extends unknown
    ? Omit<T, K>
    : never;

export interface BridgeOptions {
    /** where to listen: a connection of its own, kept for the life of the bridge */
    databaseUrl: string;
    /** sends a payload to every listener of a channel (`select pg_notify($1, $2)`) */
    notify: (channel: string, payload: string) => Promise<unknown>;
    /** wait before listening again after the connection dropped */
    retryMs?: number;
}

/**
 * In-process pub/sub that pushes "new version" and "link changed" messages to
 * open share viewers. Alone it reaches the viewers of this process; with a
 * bridge it reaches those of every replica sharing the database, through
 * Postgres LISTEN/NOTIFY. Events that fall in a gap while the listening
 * connection is down are not replayed.
 */
export function createEventBus() {
    const bus = new EventEmitter();
    bus.setMaxListeners(0);
    // tells this bus's own notifications from the other replicas'
    const origin = randomUUID();
    let send: ((payload: string) => Promise<unknown>) | null = null;

    const relay = (msg: DistributiveOmit<Wire, 'o'>) => {
        if (!send) return;
        send(JSON.stringify({ o: origin, ...msg })).catch((err: unknown) => {
            console.error(
                'Event relay failed:',
                err instanceof Error ? err.message : err
            );
        });
    };

    const receive = (payload: string) => {
        let msg: Wire;
        try {
            msg = JSON.parse(payload) as Wire;
        } catch {
            return;
        }
        if (msg.o === origin) return;
        if (msg.t === 'publish' && typeof msg.d === 'string') {
            bus.emit('publish', msg.d, msg.v);
        } else if (msg.t === 'link' && typeof msg.l === 'string') {
            bus.emit('link', msg.l);
        }
    };

    const emitPublish = (diagramId: string, version: number) => {
        bus.emit('publish', diagramId, version);
        relay({ t: 'publish', d: diagramId, v: version });
    };
    const emitLinkChanged = (linkId: string) => {
        bus.emit('link', linkId);
        relay({ t: 'link', l: linkId });
    };

    const onPublish = (fn: PublishListener) => {
        bus.on('publish', fn);
        return () => bus.off('publish', fn);
    };
    const onLinkChanged = (fn: LinkListener) => {
        bus.on('link', fn);
        return () => bus.off('link', fn);
    };

    /** Starts relaying; resolves once listening (or after the first failed try) and returns the stop function. */
    async function startBridge(
        options: BridgeOptions
    ): Promise<() => Promise<void>> {
        const { databaseUrl, notify, retryMs = 2_000 } = options;
        let stopped = false;
        let client: pg.Client | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;

        const schedule = () => {
            if (stopped || retry) return;
            retry = setTimeout(() => {
                retry = undefined;
                void listen();
            }, retryMs);
            retry.unref();
        };

        const listen = async () => {
            if (stopped) return;
            const c = new pg.Client({ connectionString: databaseUrl });
            const lost = () => {
                if (client === c) client = null;
                c.removeAllListeners();
                // an error on a dead client must not crash the process
                c.on('error', () => undefined);
                c.end().catch(() => undefined);
                schedule();
            };
            c.on('error', lost);
            c.on('end', lost);
            c.on('notification', (m) => {
                if (m.channel === EVENTS_CHANNEL && m.payload)
                    receive(m.payload);
            });
            try {
                await c.connect();
                await c.query(`LISTEN ${EVENTS_CHANNEL}`);
                if (stopped) return void (await c.end());
                client = c;
            } catch (err) {
                console.error(
                    'Event listener failed to start:',
                    err instanceof Error ? err.message : err
                );
                lost();
            }
        };

        send = (payload) => notify(EVENTS_CHANNEL, payload);
        await listen();
        return async () => {
            stopped = true;
            send = null;
            clearTimeout(retry);
            const c = client;
            client = null;
            if (c) {
                c.removeAllListeners();
                c.on('error', () => undefined);
                await c.end().catch(() => undefined);
            }
        };
    }

    return {
        emitPublish,
        emitLinkChanged,
        onPublish,
        onLinkChanged,
        startBridge,
    };
}

const defaultBus = createEventBus();
export const emitPublish = defaultBus.emitPublish;
export const emitLinkChanged = defaultBus.emitLinkChanged;
export const onPublish = defaultBus.onPublish;
export const onLinkChanged = defaultBus.onLinkChanged;
export const startEventBridge = defaultBus.startBridge;
