import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client.js';
import * as service from '../src/diagrams/service.js';
import { emitPublish } from '../src/events.js';
import { createSnapshotCache } from '../src/share/snapshot-cache.js';

vi.mock('../src/diagrams/service.js', () => ({
    latestSnapshot: vi.fn(),
    latestSnapshotMeta: vi.fn(),
}));

const db = {} as Db;
const snap = (version: number) => ({ version, title: `v${version}`, content: {}, publishedAt: new Date(0) });
const latest = vi.mocked(service.latestSnapshot);
const meta = vi.mocked(service.latestSnapshotMeta);

describe('the shared snapshot cache', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        latest.mockReset();
        meta.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    it('serves one read to every viewer within the ttl', async () => {
        latest.mockResolvedValue(snap(1) as never);
        const cache = createSnapshotCache(db, 2_000);
        try {
            const [a, b] = await Promise.all([cache.get('d1'), cache.get('d1')]);
            expect(a).toBe(b);
            expect(latest).toHaveBeenCalledTimes(1);
        } finally {
            cache.close();
        }
    });

    it('reads again once the ttl has passed', async () => {
        latest.mockResolvedValueOnce(snap(1) as never).mockResolvedValueOnce(snap(2) as never);
        const cache = createSnapshotCache(db, 2_000);
        try {
            expect((await cache.get('d1'))?.version).toBe(1);
            vi.advanceTimersByTime(2_001);
            expect((await cache.get('d1'))?.version).toBe(2);
        } finally {
            cache.close();
        }
    });

    it('drops the entry on a publish, so a viewer told of it never gets the old version', async () => {
        latest.mockResolvedValueOnce(snap(1) as never).mockResolvedValueOnce(snap(2) as never);
        const cache = createSnapshotCache(db, 60_000);
        try {
            expect((await cache.get('d1'))?.version).toBe(1);
            emitPublish('d1', 2);
            expect((await cache.get('d1'))?.version).toBe(2);
            // another diagram's publish leaves it alone
            emitPublish('other', 9);
            await cache.get('d1');
            expect(latest).toHaveBeenCalledTimes(2);
        } finally {
            cache.close();
        }
    });

    it('does not serve a failed read again', async () => {
        latest.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(snap(1) as never);
        const cache = createSnapshotCache(db, 60_000);
        try {
            await expect(cache.get('d1')).rejects.toThrow('db down');
            // let the catch handler forget the entry
            await Promise.resolve();
            expect((await cache.get('d1'))?.version).toBe(1);
        } finally {
            cache.close();
        }
    });

    it('keeps at most maxEntries diagrams', async () => {
        latest.mockImplementation(async (_db, id) => snap(Number(String(id).slice(1))) as never);
        const cache = createSnapshotCache(db, 60_000, 2);
        try {
            await cache.get('d1');
            await cache.get('d2');
            await cache.get('d3');
            latest.mockClear();
            await cache.get('d3');
            await cache.get('d2');
            expect(latest).not.toHaveBeenCalled();
            // d1 was the oldest and was dropped
            await cache.get('d1');
            expect(latest).toHaveBeenCalledTimes(1);
        } finally {
            cache.close();
        }
    });

    it('stops listening and forgets everything on close', async () => {
        latest.mockResolvedValue(snap(1) as never);
        const cache = createSnapshotCache(db, 60_000);
        await cache.get('d1');
        cache.close();
        await cache.get('d1');
        expect(latest).toHaveBeenCalledTimes(2);
    });

    describe('version (for the heartbeat)', () => {
        it('is the newest number, shared within the ttl and without the content', async () => {
            meta.mockResolvedValue({ version: 7, publishedAt: new Date(0), contentHash: 'h' } as never);
            const cache = createSnapshotCache(db, 2_000);
            try {
                expect(await Promise.all([cache.version('d1'), cache.version('d1')])).toEqual([7, 7]);
                expect(meta).toHaveBeenCalledTimes(1);
                expect(latest).not.toHaveBeenCalled();
            } finally {
                cache.close();
            }
        });

        it('is undefined before anything is published, and is read again after a publish', async () => {
            meta.mockResolvedValueOnce(undefined as never).mockResolvedValueOnce({ version: 1, publishedAt: new Date(0), contentHash: 'h' } as never);
            const cache = createSnapshotCache(db, 60_000);
            try {
                expect(await cache.version('d1')).toBeUndefined();
                emitPublish('d1', 1);
                expect(await cache.version('d1')).toBe(1);
            } finally {
                cache.close();
            }
        });

        it('does not serve a failed read again', async () => {
            meta.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce({ version: 3, publishedAt: new Date(0), contentHash: 'h' } as never);
            const cache = createSnapshotCache(db, 60_000);
            try {
                await expect(cache.version('d1')).rejects.toThrow('db down');
                await Promise.resolve();
                expect(await cache.version('d1')).toBe(3);
            } finally {
                cache.close();
            }
        });
    });
});
