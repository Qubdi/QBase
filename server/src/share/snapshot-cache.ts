import type { Db } from '../db/client.js';
import { latestSnapshot } from '../diagrams/service.js';
import { onPublish } from '../events.js';

type Snapshot = Awaited<ReturnType<typeof latestSnapshot>>;

/**
 * The latest snapshot of a diagram, shared for a moment. One publish makes
 * every live viewer of the diagram fetch it again at once; they all get the
 * one read instead of a query each, and its content. A publish (made here or
 * by another replica) drops the entry first, so a viewer told about a new
 * version never gets the old one: this listener is registered before the
 * viewers' own.
 */
export function createSnapshotCache(db: Db, ttlMs = 2_000, maxEntries = 16) {
    const entries = new Map<
        string,
        { at: number; snapshot: Promise<Snapshot> }
    >();
    const stopListening = onPublish((diagramId) => {
        entries.delete(diagramId);
    });
    return {
        get(diagramId: string): Promise<Snapshot> {
            const now = Date.now();
            const hit = entries.get(diagramId);
            if (hit && now - hit.at < ttlMs) return hit.snapshot;
            const snapshot = latestSnapshot(db, diagramId);
            entries.set(diagramId, { at: now, snapshot });
            // a failed read must not be served again
            snapshot.catch(() => {
                if (entries.get(diagramId)?.snapshot === snapshot) {
                    entries.delete(diagramId);
                }
            });
            // content can be large: keep few entries, and only fresh ones
            for (const [key, entry] of entries) {
                if (now - entry.at >= ttlMs) entries.delete(key);
            }
            while (entries.size > maxEntries) {
                const oldest = entries.keys().next().value;
                if (oldest === undefined) break;
                entries.delete(oldest);
            }
            return snapshot;
        },
        close() {
            stopListening();
            entries.clear();
        },
    };
}
