import type { CounterStore } from './counters.js';

interface RouteParams {
    routeInfo?: { method?: string | string[]; url?: string };
}

type Done = (err: Error | null, res?: { current: number; ttl: number }) => void;

/**
 * A store for @fastify/rate-limit that keeps its counts in the shared
 * counters, so a per-address limit holds across every server process. The
 * plugin builds one store per route (`child`); its counts are told apart by
 * the route's method and path, the same in every process.
 */
export function sharedRateLimitStore(counters: CounterStore) {
    return class SharedRateLimitStore {
        private scope = 'global';

        // the plugin passes its settings; none of them is needed here
        constructor(_params?: unknown) {}

        incr(key: string, cb: Done, timeWindow: number) {
            counters.hit(`ip:${this.scope}:${key}`, timeWindow).then(
                (r) => cb(null, { current: r.count, ttl: r.resetInMs }),
                (err: unknown) => cb(err instanceof Error ? err : new Error(String(err)))
            );
        }

        read(key: string, cb: Done) {
            counters.peek(`ip:${this.scope}:${key}`).then(
                (r) => cb(null, { current: r?.count ?? 0, ttl: r?.resetInMs ?? 0 }),
                (err: unknown) => cb(err instanceof Error ? err : new Error(String(err)))
            );
        }

        child(params: unknown) {
            const info = (params as RouteParams).routeInfo;
            const store = new SharedRateLimitStore(params);
            const method = info?.method;
            store.scope = `${Array.isArray(method) ? method.join(',') : (method ?? '')}:${info?.url ?? ''}`;
            return store;
        }
    };
}
