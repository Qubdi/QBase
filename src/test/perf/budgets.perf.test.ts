// Time budgets for the pure-TS hot paths: each operation is timed at 100 and
// 1000 tables (median of several samples after a warm-up) and must stay under
// its budget, and time(1000) / time(100) must stay under a bound that a
// linear or n log n operation meets easily and an accidental O(n²) does not
// (linear gives about 10, quadratic about 100).
//
// Run with the perf config only (the normal `vitest run` skips this file):
//   npx vitest run --config vitest.perf.config.ts
// PERF_BUDGET_SCALE=2 doubles every budget (a slower machine, CI).
//
// Each test is retried twice, so one noisy sample does not fail the run.
// Budgets are about 3x the medians measured when the suite was written (Node
// 24 in docker, 6 cores); see the table this file prints to recalibrate.
import { afterAll, describe, expect, it } from 'vitest';
import { OPS } from './ops';
import { time } from './measure';
import type { Timing } from './measure';

const SMALL = 100;
const LARGE = 1000;

/** ms for [100 tables, 1000 tables]. */
const BUDGETS_MS: Record<string, readonly [number, number]> = {
    'sql.import.postgresql': [30, 400],
    'sql.import.mysql': [60, 470],
    'sql.import.sql_server': [35, 440],
    'sql.import.mariadb': [30, 370],
    'sql.import.sqlite': [30, 360],
    'sql.import.oracle': [35, 420],
    'sql.export.postgresql': [8, 80],
    'sql.export.mysql': [10, 175],
    'sql.export.sql_server': [10, 170],
    'sql.export.mariadb': [8, 145],
    'sql.export.sqlite': [7, 105],
    'sql.export.oracle': [8, 175],
    'dbml.import': [230, 2200],
    'dbml.export': [3, 30],
    'dbml.diff': [3, 40],
    'dbml.diff+proposal': [5, 70],
    'wire.serialiseText': [7, 75],
    'wire.parse': [5, 60],
    'wire.fileExport': [10, 105],
    'wire.fileImport': [18, 160],
    'cmd.moveAll': [0.2, 1],
    'cmd.addColumn+undo': [1.5, 14],
    'cmd.session100': [900, 1700],
    'cmd.deleteAll+undo': [3, 32],
    'cmd.delete10%+undo': [2.5, 25],
    'layout.arrange': [0.5, 7],
    'lint.all': [4, 60],
    'lint.withProjection': [10, 150],
    'drift.reconcile': [5, 55],
};

/** Highest allowed time(1000) / time(100); linear is about 10. */
const DEFAULT_RATIO = 40;
const RATIO: Record<string, number> = {
    // a few microseconds at 100 tables: the ratio is mostly noise and JIT
    'cmd.moveAll': 80,
    // known: the cross-dialect converter looks tables up with a linear scan
    // per table, foreign key and index (convertDesign, src/dialects/convert/
    // engine.ts), so it is already superlinear (about 20 to 28 here)
    'sql.export.mysql': 50,
    'sql.export.sql_server': 50,
    'sql.export.mariadb': 50,
    'sql.export.sqlite': 50,
    'sql.export.oracle': 50,
};

const SCALE = Number(process.env.PERF_BUDGET_SCALE ?? 1) || 1;

const results: { name: string; small: Timing; large: Timing }[] = [];

describe.skipIf(!process.env.QBASE_PERF)('performance budgets', () => {
    afterAll(() => {
        const pad = (s: string, w: number) => s.padStart(w);
        const lines = results.map(({ name, small, large }) => {
            const [b100, b1000] = BUDGETS_MS[name] ?? [NaN, NaN];
            return [
                name.padEnd(24),
                pad(small.median.toFixed(3), 10),
                pad((b100 * SCALE).toString(), 8),
                pad(large.median.toFixed(3), 10),
                pad((b1000 * SCALE).toString(), 8),
                pad((large.median / small.median).toFixed(1), 7),
            ].join(' ');
        });
        console.log(
            [
                `${'operation'.padEnd(24)} ${pad('100 ms', 10)} ${pad('budget', 8)} ${pad('1000 ms', 10)} ${pad('budget', 8)} ${pad('ratio', 7)}`,
                ...lines,
            ].join('\n')
        );
    });

    it('has a budget for every operation', () => {
        expect(OPS.map((op) => op.name).filter((n) => !BUDGETS_MS[n])).toEqual(
            []
        );
    });

    for (const op of OPS) {
        // a busy machine (another build, a browser test) can push one median
        // over its budget; a real regression fails every attempt
        it(op.name, { retry: 2 }, () => {
            const small = time(op.prepare(SMALL), { samples: 7, warmup: 2 });
            const large = time(op.prepare(LARGE), { samples: 7, warmup: 2 });
            const row = { name: op.name, small, large };
            const at = results.findIndex((r) => r.name === op.name);
            if (at >= 0) results[at] = row;
            else results.push(row);
            const [b100, b1000] = BUDGETS_MS[op.name];
            expect(
                small.median,
                `${op.name} at ${SMALL} tables: median ${small.median.toFixed(3)} ms`
            ).toBeLessThan(b100 * SCALE);
            expect(
                large.median,
                `${op.name} at ${LARGE} tables: median ${large.median.toFixed(3)} ms`
            ).toBeLessThan(b1000 * SCALE);
            const ratio = large.median / small.median;
            expect(
                ratio,
                `${op.name}: time(${LARGE}) / time(${SMALL}) = ${ratio.toFixed(1)}, worse than linear (O(n²)?)`
            ).toBeLessThan(RATIO[op.name] ?? DEFAULT_RATIO);
        });
    }
});
