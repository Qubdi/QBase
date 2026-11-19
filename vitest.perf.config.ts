// The pure-TS performance suite: benchmarks (*.bench.ts) and time budgets
// (*.perf.test.ts) for SQL/DBML import and export, the saved form, commands
// and undo, auto-arrange and lint, at up to 1000 tables. It extends the main
// config but runs in plain Node, one file at a time, so timings are steady.
//
//   npx vitest run   --config vitest.perf.config.ts   # budgets (pass / fail)
//   npx vitest bench --config vitest.perf.config.ts   # benchmark tables
//
// The normal `vitest run` never runs these: it does not collect *.bench.ts,
// and the *.perf.test.ts files skip themselves unless QBASE_PERF is set, which
// only this config does. PERF_BUDGET_SCALE=2 doubles every budget on a slower
// machine (CI).
import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

export default defineConfig({
    ...base,
    test: {
        ...base.test,
        environment: 'node',
        setupFiles: ['./src/test/perf/setup.ts'],
        include: ['src/test/perf/**/*.perf.test.ts'],
        exclude: ['**/node_modules/**'],
        benchmark: {
            include: ['src/test/perf/**/*.bench.ts'],
            // the module runner's export getters (getItem, TABLE_WIDTH...)
            // cost nanoseconds per call, far below what is measured here
            suppressExportGetterWarnings: true,
        },
        env: { QBASE_PERF: '1' },
        fileParallelism: false,
        // building and timing 1000-table designs takes a while
        testTimeout: 600_000,
        hookTimeout: 600_000,
    },
});
