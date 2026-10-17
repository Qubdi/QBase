import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AUTOSAVE_DELAY_MS,
    createAutosaver,
    type SaveStatus,
} from '../autosave';

const setup = (
    save: (v: { n: number }) => Promise<void> = () => Promise.resolve()
) => {
    const saved: number[] = [];
    const statuses: SaveStatus[] = [];
    const saver = createAutosaver<{ n: number }>({
        delayMs: 1000,
        save: async (v) => {
            saved.push(v.n);
            await save(v);
        },
        onStatus: (s) => statuses.push(s),
        serialize: (v) => String(v.n),
    });
    return { saver, saved, statuses };
};

describe('createAutosaver', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not save the first value: it is the baseline', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        await vi.advanceTimersByTimeAsync(5000);
        expect(saved).toEqual([]);
    });

    it('saves a change once the edits pause', async () => {
        const { saver, saved, statuses } = setup();
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(999);
        expect(saved).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(saved).toEqual([2]);
        expect(statuses).toEqual(['pending', 'saving', 'saved']);
    });

    it('sends only the latest value after a burst of edits', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        for (const n of [2, 3, 4]) {
            saver.update({ n });
            await vi.advanceTimersByTimeAsync(400);
        }
        await vi.advanceTimersByTimeAsync(1000);
        expect(saved).toEqual([4]);
    });

    it('does not save when the content returns to what is saved', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        saver.update({ n: 1 });
        await vi.advanceTimersByTimeAsync(5000);
        expect(saved).toEqual([]);
    });

    it('does not save the same content twice', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(1000);
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(5000);
        expect(saved).toEqual([2]);
    });

    it('sends an edit made during a save right after it, never in parallel', async () => {
        let release: () => void = () => undefined;
        let active = 0;
        let maxActive = 0;
        const { saver, saved } = setup(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>((r) => (release = r));
            active--;
        });
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(1000); // save of 2 starts and hangs
        saver.update({ n: 3 });
        await vi.advanceTimersByTimeAsync(1000); // timer fires while busy
        expect(saved).toEqual([2]);
        release();
        await vi.advanceTimersByTimeAsync(0);
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(saved).toEqual([2, 3]);
        expect(maxActive).toBe(1);
    });

    it('reports a failure and retries the change on flush', async () => {
        let fail = true;
        const { saver, saved, statuses } = setup(async () => {
            if (fail) throw new Error('offline');
        });
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(1000);
        expect(statuses.at(-1)).toBe('error');
        fail = false;
        await saver.flush();
        expect(saved).toEqual([2, 2]);
        expect(statuses.at(-1)).toBe('saved');
    });

    it('retries with the next edit after a failure', async () => {
        let fail = true;
        const { saver, saved, statuses } = setup(async () => {
            if (fail) throw new Error('offline');
        });
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await vi.advanceTimersByTimeAsync(1000);
        fail = false;
        saver.update({ n: 3 });
        await vi.advanceTimersByTimeAsync(1000);
        expect(saved).toEqual([2, 3]);
        expect(statuses.at(-1)).toBe('saved');
    });

    it('flushes a pending change immediately', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        await saver.flush();
        expect(saved).toEqual([2]);
        await vi.advanceTimersByTimeAsync(5000);
        expect(saved).toEqual([2]);
    });

    it('does nothing after dispose', async () => {
        const { saver, saved } = setup();
        saver.update({ n: 1 });
        saver.update({ n: 2 });
        saver.dispose();
        saver.update({ n: 3 });
        await vi.advanceTimersByTimeAsync(5000);
        expect(saved).toEqual([]);
    });

    describe('waiting to save', () => {
        it('waits ten seconds by default', () => {
            expect(AUTOSAVE_DELAY_MS).toBe(10_000);
        });

        it('says changes are pending as soon as there is something to save', async () => {
            const { saver, statuses } = setup();
            saver.update({ n: 1 });
            expect(statuses).toEqual([]); // the baseline is not a change
            saver.update({ n: 2 });
            expect(statuses).toEqual(['pending']);
        });

        it('says it once for a burst of edits, not once per edit', async () => {
            const { saver, statuses } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            saver.update({ n: 3 });
            saver.update({ n: 4 });
            expect(statuses.filter((s) => s === 'pending')).toHaveLength(1);
        });

        it('goes back to saved when the edits were undone before saving', async () => {
            const { saver, saved, statuses } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            saver.update({ n: 1 });
            expect(statuses).toEqual(['pending', 'saved']);
            await vi.advanceTimersByTimeAsync(5000);
            expect(saved).toEqual([]);
        });

        it('shows pending again for the next edit after a save', async () => {
            const { saver, statuses } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            await vi.advanceTimersByTimeAsync(1000);
            saver.update({ n: 3 });
            expect(statuses).toEqual(['pending', 'saving', 'saved', 'pending']);
        });

        it('shows saving, not pending, once the request has started', async () => {
            const { saver, statuses } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            await vi.advanceTimersByTimeAsync(1000);
            expect(statuses.slice(-2)).toEqual(['saving', 'saved']);
        });

        it('can be saved right away instead of waiting', async () => {
            const { saver, saved, statuses } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            await saver.flush();
            expect(saved).toEqual([2]);
            expect(statuses).toEqual(['pending', 'saving', 'saved']);
        });
    });

    describe('discard', () => {
        it('drops the unsent change, so even a flush sends nothing', async () => {
            const { saver, saved } = setup();
            saver.update({ n: 1 });
            saver.update({ n: 2 });
            saver.discard();
            await saver.flush();
            await vi.advanceTimersByTimeAsync(5000);
            expect(saved).toEqual([]);
        });

        it('ignores edits made afterwards', async () => {
            const { saver, saved } = setup();
            saver.update({ n: 1 });
            saver.discard();
            saver.update({ n: 2 });
            await vi.advanceTimersByTimeAsync(5000);
            expect(saved).toEqual([]);
        });
    });
});
