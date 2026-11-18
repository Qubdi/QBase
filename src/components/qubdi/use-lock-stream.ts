import { useCallback, useEffect, useMemo, useState } from 'react';
import type { z } from 'zod';
import { api } from '@/lib/qubdi/api';
import { pokeEvent, pokeResultEvent } from '@/lib/qubdi/api-schemas';
import { getEditorId } from '@/lib/qubdi/editor-id';
import type {
    IncomingPoke,
    LockChannelValue,
    PokeResult,
} from './lock-channel-context';

/** Wait before opening a new stream after the browser gave up on the old one. */
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

interface State {
    /** the diagram these belong to: another diagram starts clean */
    remoteId: string | undefined;
    incoming: (IncomingPoke & { until: number }) | null;
    result: PokeResult | null;
}

const fresh = (remoteId: string | undefined): State => ({
    remoteId,
    incoming: null,
    result: null,
});

/** What a stream event carries, or null when it is not what the server sends. */
const read = <T>(schema: z.ZodType<T>, event: Event): T | null => {
    try {
        const parsed = schema.safeParse(
            JSON.parse((event as MessageEvent<string>).data)
        );
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
};

/**
 * Listens to the open diagram's lock stream, the way a share viewer listens
 * for new versions: the server pushes the moment something happens to this
 * editor's lock. For the holder that is a request to step out; for an editor
 * that asked, how the request ended. The browser reconnects a dropped stream
 * by itself and the server repeats what was missed; one it gave up on (an
 * error reply) is opened again after a growing wait.
 *
 * Nothing is opened without a server diagram, or where EventSource is missing.
 */
export function useLockStream(remoteId: string | undefined): LockChannelValue {
    const [state, setState] = useState<State>(() => fresh(remoteId));
    // another diagram starts clean: reset while rendering, not in the effect
    if (state.remoteId !== remoteId) setState(fresh(remoteId));

    useEffect(() => {
        if (!remoteId || typeof EventSource === 'undefined') return;
        const editorId = getEditorId();
        let source: EventSource | null = null;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let delay = RECONNECT_MIN_MS;

        const connect = () => {
            const next = new EventSource(
                api.lockEventsUrl(remoteId, editorId),
                {
                    withCredentials: true,
                }
            );
            source = next;
            next.addEventListener('poke', (event) => {
                const poke = read(pokeEvent, event);
                if (!poke) return;
                // counted from now, not from the server's clock, which may differ
                const until = Date.now() + poke.waitSeconds * 1000;
                setState((s) =>
                    s.remoteId === remoteId
                        ? {
                              ...s,
                              incoming: {
                                  pokeId: poke.pokeId,
                                  from: poke.from,
                                  until,
                              },
                          }
                        : s
                );
            });
            next.addEventListener('poke-result', (event) => {
                const result = read(pokeResultEvent, event);
                if (!result) return;
                setState((s) =>
                    s.remoteId === remoteId ? { ...s, result } : s
                );
            });
            next.addEventListener('open', () => {
                delay = RECONNECT_MIN_MS;
            });
            next.addEventListener('error', () => {
                // the browser reconnects a dropped stream by itself, but gives
                // up for good on an error reply: open a new one
                if (next.readyState !== EventSource.CLOSED) return;
                next.close();
                retry = setTimeout(connect, delay);
                delay = Math.min(delay * 2, RECONNECT_MAX_MS);
            });
        };
        connect();
        return () => {
            clearTimeout(retry);
            source?.close();
        };
    }, [remoteId]);

    // a request nobody answered stops waiting on the server too: stop showing it
    const waitingId = state.incoming?.pokeId;
    const until = state.incoming?.until;
    useEffect(() => {
        if (waitingId === undefined || until === undefined) return;
        const timer = setTimeout(
            () =>
                setState((s) =>
                    s.incoming?.pokeId === waitingId
                        ? { ...s, incoming: null }
                        : s
                ),
            Math.max(0, until - Date.now())
        );
        return () => clearTimeout(timer);
    }, [waitingId, until]);

    const dismiss = useCallback(
        (pokeId: string) =>
            setState((s) =>
                s.incoming?.pokeId === pokeId ? { ...s, incoming: null } : s
            ),
        []
    );

    return useMemo(
        () => ({
            incoming: state.incoming
                ? { pokeId: state.incoming.pokeId, from: state.incoming.from }
                : null,
            result: state.result,
            dismiss,
        }),
        [state.incoming, state.result, dismiss]
    );
}
