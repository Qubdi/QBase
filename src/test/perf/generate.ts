// Synthetic diagrams of any size for the performance suite (*.bench.ts and
// budgets.perf.test.ts). Everything is deterministic: the same size always
// gives the same SQL, design and ids, so runs are comparable.
//
// The shape follows tools/e2e/perf.mjs (8 columns, about one link per table)
// with a secondary index per table and a unique column, so the importers, the
// writers and the lint rules all have something to do.
import { DATABASE_TYPES } from '@/core/model/database';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import { seededRandom } from '@/core/model/ids';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { importDbml } from '@/formats/dbml/import-dbml';
import { exportSql } from '@/formats/sql/export-sql';
import { importSql } from '@/formats/sql/import-sql';

/** The sizes the benchmarks cover. */
export const BENCH_SIZES = [50, 200, 500, 1000] as const;

export const DIALECTS: readonly DatabaseType[] = DATABASE_TYPES;

/** A fixed clock, so `updatedAt` and the like never differ between runs. */
export const NOW = Date.UTC(2026, 0, 1);

/** The table that table `i` points at: an earlier one, spread pseudo-randomly. */
export function parentOf(i: number): number | undefined {
    return i === 0 ? undefined : (((i * 2654435761) % 4294967296) >>> 7) % i;
}

/**
 * A PostgreSQL script of `n` tables. With `variant` every 10th table has an
 * extra column, every 25th a changed type, and the last table is dropped and
 * another added: an edit of the DBML for the diff benchmarks.
 */
export function makeSql(n: number, variant = false): string {
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
        if (variant && i === n - 1) continue;
        const parent = parentOf(i);
        const cols = [
            'id integer NOT NULL',
            parent === undefined
                ? 'owner_id integer'
                : `owner_id integer REFERENCES public.t_${parent}(id)`,
            'name character varying(60) NOT NULL',
            'email character varying(120) UNIQUE',
            'created_at timestamp without time zone',
            variant && i % 25 === 0
                ? 'amount numeric(12,4)'
                : 'amount numeric(10,2)',
            'active boolean DEFAULT true',
            'notes text',
        ];
        if (variant && i % 10 === 0) cols.push('extra_col integer');
        out.push(
            `CREATE TABLE public.t_${i} (\n    ${cols.join(',\n    ')},\n    PRIMARY KEY (id)\n);`,
            `CREATE INDEX ix_t_${i}_name ON public.t_${i} (name, created_at);`
        );
    }
    if (variant)
        out.push(
            'CREATE TABLE public.t_added (\n    id integer NOT NULL,\n    label text,\n    PRIMARY KEY (id)\n);'
        );
    return out.join('\n');
}

/** A PostgreSQL design of `n` tables, built by the SQL importer. */
export function makeDesign(n: number, variant = false): Design {
    const result = importSql(makeSql(n, variant), 'postgresql', {
        now: NOW,
        random: seededRandom(n + (variant ? 1 : 0)),
        name: `perf ${n}`,
    });
    if (!result.design)
        throw new Error(
            `generator: no design for ${n} tables: ${result.diagnostics.map((d) => d.message).join('; ')}`
        );
    // the importer stacks every table at one place; spread them on a grid so
    // the layout code and the region checks see a realistic diagram
    const byId = { ...result.design.entities.byId };
    result.design.entities.order.forEach((id, i) => {
        byId[id] = {
            ...byId[id],
            x: (i % 20) * 320,
            y: Math.floor(i / 20) * 360,
        };
    });
    return {
        ...result.design,
        entities: { ...result.design.entities, byId },
    };
}

/** The SQL a dialect writes for the design of `n` tables (input for its reader). */
export function makeDialectSql(n: number, dialect: DatabaseType): string {
    if (dialect === 'postgresql') return makeSql(n);
    const out = exportSql(getDesign(n), dialect);
    if (!out.text)
        throw new Error(
            `generator: ${dialect} wrote nothing: ${out.diagnostics.map((d) => d.message).join('; ')}`
        );
    return out.text;
}

/** The DBML of the design of `n` tables. */
export function makeDbml(n: number, variant = false): string {
    return exportDbml(getDesign(n, variant)).text;
}

/** The design read back from the DBML of the variant: the "edited" side of a diff. */
export function makeParsedVariant(n: number): Design {
    const result = importDbml(makeDbml(n, true), 'postgresql', {
        now: NOW,
        random: seededRandom(7 * n),
    });
    if (!result.design)
        throw new Error(
            `generator: DBML import failed: ${result.diagnostics.map((d) => d.message).join('; ')}`
        );
    return result.design;
}

// Building a design of 1000 tables costs a few hundred ms; build each once.
const cache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as T;
}

export const getDesign = (n: number, variant = false): Design =>
    cached(`design:${n}:${variant}`, () => makeDesign(n, variant));
export const getDialectSql = (n: number, dialect: DatabaseType): string =>
    cached(`sql:${n}:${dialect}`, () => makeDialectSql(n, dialect));
export const getDbml = (n: number, variant = false): string =>
    cached(`dbml:${n}:${variant}`, () => makeDbml(n, variant));
export const getParsedVariant = (n: number): Design =>
    cached(`parsed:${n}`, () => makeParsedVariant(n));
