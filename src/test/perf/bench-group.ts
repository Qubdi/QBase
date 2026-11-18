// Registers the benchmarks of one group of operations (see ops.ts): one test
// per operation, comparing its sizes, so `vitest bench` prints a table per
// operation with 50, 200, 500 and 1000 tables side by side.
import { describe, test } from 'vitest';
import { BENCH_SIZES } from './generate';
import { opsOf } from './ops';
import type { Group } from './ops';

/** Enough samples for a stable mean without making 1000-table imports slow. */
const RUN = { time: 400, iterations: 5, warmupIterations: 2, warmupTime: 0 };

export function benchGroup(group: Group): void {
    describe(group, () => {
        for (const op of opsOf(group)) {
            test(op.name, async ({ bench }) => {
                const runs = BENCH_SIZES.map((n) =>
                    bench(`${op.name} ${n} tables`, op.prepare(n))
                );
                await bench.compare(...runs, RUN);
            });
        }
    });
}
