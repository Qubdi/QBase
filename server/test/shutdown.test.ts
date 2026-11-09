import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../src/shutdown.js';

describe('createShutdown', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const setup = (over: Partial<Parameters<typeof createShutdown>[0]> = {}) => {
        const order: string[] = [];
        const exit = vi.fn();
        const logError = vi.fn();
        const shutdown = createShutdown({
            stopMaintenance: async () => void order.push('maintenance'),
            closeApp: async () => void order.push('app'),
            closePool: async () => void order.push('pool'),
            exit,
            log: () => undefined,
            logError,
            ...over,
        });
        return { shutdown, order, exit, logError };
    };

    it('stops maintenance, closes the app, then the pool, then exits 0', async () => {
        const { shutdown, order, exit } = setup();
        await shutdown('SIGTERM');
        expect(order).toEqual(['maintenance', 'app', 'pool']);
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('closes in order after an unhandled error, but exits 1', async () => {
        const { shutdown, order, exit } = setup();
        await shutdown('unhandledRejection', true);
        expect(order).toEqual(['maintenance', 'app', 'pool']);
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('runs once however many signals arrive', async () => {
        const { shutdown, order, exit } = setup();
        await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
        await shutdown('SIGTERM');
        expect(order).toEqual(['maintenance', 'app', 'pool']);
        expect(exit).toHaveBeenCalledTimes(1);
    });

    it('exits 1 and still reports when a step fails, without closing the pool', async () => {
        const { shutdown, order, exit, logError } = setup({
            closeApp: async () => {
                throw new Error('stuck');
            },
        });
        await shutdown('SIGTERM');
        expect(order).toEqual(['maintenance']);
        expect(logError).toHaveBeenCalled();
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('forces exit 1 when a step never finishes', async () => {
        const { shutdown, exit } = setup({
            closeApp: () => new Promise(() => undefined),
            forceAfterMs: 5000,
        });
        void shutdown('SIGTERM');
        await vi.advanceTimersByTimeAsync(4999);
        expect(exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2);
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });
});
