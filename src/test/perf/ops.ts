// The operations the performance suite times. Each one is prepared for a size
// (inputs built and cached outside the timed part) and returns the function to
// time. The *.bench.ts files and budgets.perf.test.ts share this list, so a
// benchmark and its budget always measure the same thing.
import { estimatedSize } from '@/core/model/region-membership';
import { apply } from '@/core/commands/apply';
import type { Command } from '@/core/commands/command';
import { planAddColumn } from '@/core/commands/plan-column';
import { planDeleteEntities } from '@/core/commands/plan-entity';
import type { Design } from '@/core/model/design';
import type { DatabaseType } from '@/core/model/database';
import { dispatch, emptyHistory, undo } from '@/core/history/history';
import type { History } from '@/core/history/history';
import { parse } from '@/core/wire/parse';
import { serialise, serialiseText } from '@/core/wire/serialise';
import { exportFileText } from '@/core/wire/file-export';
import { importFileText } from '@/core/wire/file-import';
import { seededRandom } from '@/core/model/ids';
import { planArrange } from '@/canvas/auto-arrange';
import { diffDesigns } from '@/features/dbml-diff/diff-designs';
import { buildProposal } from '@/features/dbml-diff/build-proposal';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { importDbml } from '@/formats/dbml/import-dbml';
import { exportSql } from '@/formats/sql/export-sql';
import { importSql } from '@/formats/sql/import-sql';
import { designToDiagram } from '@/qbase/diagram-convert';
import { lint } from '../../../shared/lint';
import type { LintInput } from '../../../shared/lint';
import { diagramToDesc } from '../../../shared/schema-desc';
import type { DiagramLike } from '../../../shared/schema-desc';
import { reconcile } from '../../../shared/reconcile';
import {
    DIALECTS,
    NOW,
    getDbml,
    getDesign,
    getDialectSql,
    getParsedVariant,
} from './generate';

export type Group = 'sql' | 'dbml' | 'wire' | 'commands' | 'layout' | 'lint';

export interface Op {
    name: string;
    group: Group;
    /** builds the inputs for `n` tables and returns the function to time */
    prepare: (n: number) => () => unknown;
}

function must<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new Error(`perf op: ${what}`);
    return value;
}

function ok(result: ReturnType<typeof apply>, what: string) {
    if (!result.ok) throw new Error(`perf op ${what}: ${result.message}`);
    return result;
}

const sqlImport = (dialect: DatabaseType): Op => ({
    name: `sql.import.${dialect}`,
    group: 'sql',
    prepare: (n) => {
        const text = getDialectSql(n, dialect);
        return () =>
            must(
                importSql(text, dialect, { now: NOW, random: seededRandom(1) })
                    .design,
                `${dialect} import made no design`
            );
    },
});

const sqlExport = (dialect: DatabaseType): Op => ({
    name: `sql.export.${dialect}`,
    group: 'sql',
    prepare: (n) => {
        const design = getDesign(n);
        return () => exportSql(design, dialect).text;
    },
});

/** `count` column inserts through history, then as many undos. */
function editSession(design: Design, count: number) {
    const ids = design.entities.order;
    let d = design;
    let h: History = emptyHistory();
    for (let i = 0; i < count; i += 1) {
        const id = ids[(i * 7919) % ids.length];
        const r = dispatch(d, h, must(planAddColumn(d, id), 'no column'), {
            now: NOW,
            at: i * 10_000, // far apart: no merging, one undo step each
        });
        if (!r.ok) throw new Error(r.message);
        d = r.design;
        h = r.history;
    }
    for (let i = 0; i < count; i += 1) {
        const r = undo(d, h, { now: NOW });
        if (!r.ok) throw new Error(r.message);
        d = r.design;
        h = r.history;
    }
    return d;
}

const lintInput = (design: Design): LintInput => ({
    ...(designToDiagram(design) as unknown as DiagramLike),
    databaseType: design.databaseType,
});

export const OPS: readonly Op[] = [
    // --- SQL import and export, every dialect
    ...DIALECTS.map(sqlImport),
    ...DIALECTS.map(sqlExport),

    // --- DBML
    {
        name: 'dbml.import',
        group: 'dbml',
        prepare: (n) => {
            const text = getDbml(n);
            return () =>
                must(
                    importDbml(text, 'postgresql', {
                        now: NOW,
                        random: seededRandom(1),
                    }).design,
                    'DBML import made no design'
                );
        },
    },
    {
        name: 'dbml.export',
        group: 'dbml',
        prepare: (n) => {
            const design = getDesign(n);
            return () => exportDbml(design).text;
        },
    },
    {
        name: 'dbml.diff',
        group: 'dbml',
        prepare: (n) => {
            const current = getDesign(n);
            const parsed = getParsedVariant(n);
            return () => diffDesigns(current, parsed);
        },
    },
    {
        name: 'dbml.diff+proposal',
        group: 'dbml',
        prepare: (n) => {
            const current = getDesign(n);
            const parsed = getParsedVariant(n);
            return () =>
                buildProposal(current, parsed, diffDesigns(current, parsed));
        },
    },

    // --- the saved form (serialise / parse) and the file export / import
    {
        name: 'wire.serialiseText',
        group: 'wire',
        prepare: (n) => {
            const design = getDesign(n);
            return () => serialiseText(design);
        },
    },
    {
        name: 'wire.parse',
        group: 'wire',
        prepare: (n) => {
            const raw = JSON.parse(JSON.stringify(serialise(getDesign(n))));
            return () => parse(raw, { now: NOW, random: seededRandom(1) });
        },
    },
    {
        name: 'wire.fileExport',
        group: 'wire',
        prepare: (n) => {
            const design = getDesign(n);
            return () => exportFileText(design);
        },
    },
    {
        name: 'wire.fileImport',
        group: 'wire',
        prepare: (n) => {
            const text = exportFileText(getDesign(n));
            return () =>
                importFileText(text, { now: NOW, random: seededRandom(1) });
        },
    },

    // --- commands, history
    {
        name: 'cmd.moveAll',
        group: 'commands',
        prepare: (n) => {
            const design = getDesign(n);
            const command: Command = {
                type: 'entity.move',
                moves: design.entities.order.map((id) => ({
                    id,
                    x: design.entities.byId[id].x + 10,
                    y: design.entities.byId[id].y + 10,
                })),
            };
            return () => ok(apply(design, command, { now: NOW }), 'move');
        },
    },
    {
        name: 'cmd.addColumn+undo',
        group: 'commands',
        prepare: (n) => {
            const design = getDesign(n);
            const id = design.entities.order[Math.floor(n / 2)];
            const command = must(planAddColumn(design, id), 'no column');
            return () => {
                const done = ok(apply(design, command, { now: NOW }), 'add');
                return ok(
                    apply(done.design, done.inverse, { now: NOW }),
                    'undo add'
                );
            };
        },
    },
    {
        name: 'cmd.session100',
        group: 'commands',
        prepare: (n) => {
            const design = getDesign(n);
            return () => editSession(design, 100);
        },
    },
    {
        name: 'cmd.deleteAll+undo',
        group: 'commands',
        prepare: (n) => {
            const design = getDesign(n);
            const command = planDeleteEntities(design.entities.order);
            return () => {
                const done = ok(apply(design, command, { now: NOW }), 'del');
                return ok(
                    apply(done.design, done.inverse, { now: NOW }),
                    'undo delete'
                );
            };
        },
    },
    {
        name: 'cmd.delete10%+undo',
        group: 'commands',
        prepare: (n) => {
            const design = getDesign(n);
            const ids = design.entities.order.filter((_, i) => i % 10 === 3);
            const command = planDeleteEntities(ids);
            return () => {
                const done = ok(apply(design, command, { now: NOW }), 'del');
                return ok(
                    apply(done.design, done.inverse, { now: NOW }),
                    'undo delete'
                );
            };
        },
    },

    // --- layout
    {
        name: 'layout.arrange',
        group: 'layout',
        prepare: (n) => {
            const design = getDesign(n);
            const scope = { ids: new Set(design.entities.order) };
            return () => {
                const command = must(
                    planArrange(design, scope, estimatedSize),
                    'nothing to arrange'
                );
                return ok(apply(design, command, { now: NOW }), 'arrange');
            };
        },
    },

    // --- lint and drift comparison (shared with the server and the CLI)
    {
        name: 'lint.all',
        group: 'lint',
        prepare: (n) => {
            const input = lintInput(getDesign(n));
            return () => lint(input);
        },
    },
    {
        name: 'lint.withProjection',
        group: 'lint',
        prepare: (n) => {
            const design = getDesign(n);
            return () => lint(lintInput(design));
        },
    },
    {
        name: 'drift.reconcile',
        group: 'lint',
        prepare: (n) => {
            const a = diagramToDesc(lintInput(getDesign(n)));
            const b = diagramToDesc(lintInput(getParsedVariant(n)));
            return () => reconcile(a, b);
        },
    },
];

export const opsOf = (group: Group): Op[] =>
    OPS.filter((op) => op.group === group);
