// Timing for budgets.perf.test.ts: median of several samples after a warm-up.
// A fast operation is repeated inside one sample until the sample lasts at
// least MIN_SAMPLE_MS, so timer resolution and call overhead do not swamp it.

const MIN_SAMPLE_MS = 5;

export interface Timing {
    /** median time of one call, in ms */
    median: number;
    /** fastest sample, per call, in ms */
    min: number;
    /** calls per sample */
    reps: number;
    samples: number;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// keeps results alive so the engine cannot drop a call as dead code
let sink: unknown;
export const lastResult = () => sink;

export function time(
    fn: () => unknown,
    { samples = 9, warmup = 3 }: { samples?: number; warmup?: number } = {}
): Timing {
    // warm-up also tells how many calls make one long-enough sample
    let one = Infinity;
    for (let i = 0; i < warmup; i += 1) {
        const t0 = performance.now();
        sink = fn();
        one = Math.min(one, performance.now() - t0);
    }
    const reps = Math.max(1, Math.ceil(MIN_SAMPLE_MS / Math.max(one, 0.001)));
    const perCall: number[] = [];
    for (let s = 0; s < samples; s += 1) {
        const t0 = performance.now();
        for (let r = 0; r < reps; r += 1) sink = fn();
        perCall.push((performance.now() - t0) / reps);
    }
    return {
        median: median(perCall),
        min: Math.min(...perCall),
        reps,
        samples,
    };
}
