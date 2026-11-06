import type {
    ColumnDesc,
    IndexDesc,
    RelationshipDesc,
    SchemaDesc,
    TableDesc,
} from './schema-desc.js';

// reconcile(diagram, database) answers: what would have to change in the
// diagram for it to match the database? It is pure and has no dependencies, so
// re-sync (browser) and drift detection (server) share one implementation.

export type ColumnField =
    | 'type'
    | 'nullable'
    | 'default'
    | 'primaryKey'
    | 'unique'
    | 'length'
    | 'precision'
    | 'scale'
    | 'identity'
    | 'comment';

export interface FieldChange {
    field: ColumnField;
    from: unknown;
    to: unknown;
}

export type Change =
    | { id: string; kind: 'table_added'; table: TableDesc }
    | { id: string; kind: 'table_removed'; table: TableDesc }
    | {
          id: string;
          kind: 'table_comment_changed';
          /** table key on the diagram side */
          tableKey: string;
          from: string | null;
          to: string | null;
      }
    | {
          id: string;
          kind: 'column_added';
          tableKey: string;
          column: ColumnDesc;
      }
    | {
          id: string;
          kind: 'column_removed';
          tableKey: string;
          column: ColumnDesc;
      }
    | {
          id: string;
          kind: 'column_changed';
          tableKey: string;
          before: ColumnDesc;
          after: ColumnDesc;
          changes: FieldChange[];
      }
    | { id: string; kind: 'index_added'; tableKey: string; index: IndexDesc }
    | { id: string; kind: 'index_removed'; tableKey: string; index: IndexDesc }
    | {
          id: string;
          kind: 'relationship_added';
          relationship: RelationshipDesc;
      }
    | {
          id: string;
          kind: 'relationship_removed';
          relationship: RelationshipDesc;
      }
    | {
          id: string;
          kind: 'relationship_changed';
          before: RelationshipDesc;
          after: RelationshipDesc;
      };

export type ChangeKind = Change['kind'];

export interface PossibleRename {
    id: string;
    entity: 'table' | 'column';
    /** diagram-side table key (for a column rename: the table it lives in) */
    tableKey: string;
    from: string;
    to: string;
    /** 0..1, how alike the two look */
    score: number;
    /** changes that only make sense once this rename is accepted */
    followUps: Change[];
}

export interface TableMatch {
    diagramKey: string;
    dbKey: string;
    diagramId?: string;
}

export interface ChangeSet {
    changes: Change[];
    possibleRenames: PossibleRename[];
    matched: TableMatch[];
}

export interface ReconcileOptions {
    /**
     * Names remembered from the last sync, keyed by QBase id. This is the
     * "stored source identity": it keeps a table matched even if someone
     * renamed it in the diagram.
     */
    sourceKeys?: {
        tables?: Record<string, string>;
        columns?: Record<string, string>;
    };
    /** minimum similarity for a rename hint, default 0.6 */
    renameThreshold?: number;
    /**
     * Skip table and column descriptions. Re-sync uses this so what people
     * wrote in the diagram is never reported as a difference; drift detection
     * leaves it off so a changed database comment shows up as information.
     */
    ignoreComments?: boolean;
}

const lc = (s: string) => s.toLowerCase();
const sameList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

// --- tables -----------------------------------------------------------------

interface Pairing<T> {
    pairs: Array<[T, T]>;
    leftOnly: T[];
    rightOnly: T[];
}

/** Runs the matching passes in order of trust; each pass only sees what is left. */
function pairUp<T>(
    left: T[],
    right: T[],
    passes: Array<(l: T) => string | undefined>,
    rightKeys: Array<(r: T) => string>
): Pairing<T> {
    const pairs: Array<[T, T]> = [];
    let l = [...left];
    let r = [...right];
    passes.forEach((leftKey, i) => {
        const index = new Map<string, T[]>();
        for (const x of r) {
            const k = rightKeys[i](x);
            index.set(k, [...(index.get(k) ?? []), x]);
        }
        // a key two left items share is ambiguous from their side too
        const leftCounts = new Map<string, number>();
        for (const x of l) {
            const k = leftKey(x);
            if (k !== undefined)
                leftCounts.set(k, (leftCounts.get(k) ?? 0) + 1);
        }
        const nextL: T[] = [];
        const taken = new Set<T>();
        for (const x of l) {
            const k = leftKey(x);
            const cands =
                k === undefined || leftCounts.get(k)! > 1
                    ? []
                    : (index.get(k) ?? []).filter((c) => !taken.has(c));
            // an ambiguous name-only pass must never guess
            if (cands.length === 1) {
                pairs.push([x, cands[0]]);
                taken.add(cands[0]);
            } else {
                nextL.push(x);
            }
        }
        l = nextL;
        r = r.filter((x) => !taken.has(x));
    });
    return { pairs, leftOnly: l, rightOnly: r };
}

const colSignature = (c: ColumnDesc) => `${lc(c.name)}:${c.type}`;

function similarity(a: TableDesc, b: TableDesc): number {
    const sa = new Set(a.columns.map(colSignature));
    const sb = new Set(b.columns.map(colSignature));
    if (sa.size === 0 && sb.size === 0) return 0;
    let both = 0;
    for (const s of sa) if (sb.has(s)) both++;
    return both / (sa.size + sb.size - both);
}

// --- columns ----------------------------------------------------------------

const COLUMN_FIELDS: ColumnField[] = [
    'type',
    'nullable',
    'default',
    'primaryKey',
    'unique',
    'length',
    'precision',
    'scale',
    'identity',
    'comment',
];

export function diffColumn(
    d: ColumnDesc,
    i: ColumnDesc,
    ignoreComments = false
): FieldChange[] {
    const out: FieldChange[] = [];
    for (const field of COLUMN_FIELDS) {
        if (ignoreComments && field === 'comment') continue;
        const a = d[field];
        const b = i[field];
        const na = typeof a === 'string' ? a.trim() : a;
        const nb = typeof b === 'string' ? b.trim() : b;
        if (na !== nb) out.push({ field, from: a, to: b });
    }
    return out;
}

// --- indexes ----------------------------------------------------------------

/** An index that merely backs the primary key is not interesting on its own. */
function meaningfulIndexes(t: TableDesc): IndexDesc[] {
    const pk = t.columns
        .filter((c) => c.primaryKey)
        .map((c) => c.name)
        .sort();
    return t.indexes.filter(
        (ix) =>
            !(
                ix.unique &&
                pk.length > 0 &&
                sameList([...ix.columns].sort(), pk)
            )
    );
}

const indexSignature = (ix: IndexDesc) =>
    `${ix.unique ? 'u' : 'n'}|${ix.columns.map(lc).join(',')}`;

// --- main -------------------------------------------------------------------

function diffMatchedTable(
    d: TableDesc,
    i: TableDesc,
    opts: ReconcileOptions,
    threshold: number,
    renames: PossibleRename[],
    /** collects, per table, which diagram column name maps to which database name */
    colMaps?: Map<string, Map<string, string>>
): Change[] {
    const changes: Change[] = [];
    const tk = d.key;

    if (!opts.ignoreComments && (d.comment ?? '') !== (i.comment ?? '')) {
        changes.push({
            id: `table_comment_changed:${tk}`,
            kind: 'table_comment_changed',
            tableKey: tk,
            from: d.comment,
            to: i.comment,
        });
    }

    const stored = opts.sourceKeys?.columns ?? {};
    const colPairs = pairUp(
        d.columns,
        i.columns,
        [
            (c) => (c.id && stored[c.id] ? lc(stored[c.id]) : undefined),
            (c) => lc(c.name),
        ],
        [(c) => lc(c.name), (c) => lc(c.name)]
    );

    const nameMap = new Map(
        colPairs.pairs.map(([dc, ic]) => [lc(dc.name), ic.name])
    );
    colMaps?.set(d.key, nameMap);
    for (const [dc, ic] of colPairs.pairs) {
        const diffs = diffColumn(dc, ic, opts.ignoreComments);
        if (diffs.length > 0) {
            changes.push({
                id: `column_changed:${tk}.${dc.name}`,
                kind: 'column_changed',
                tableKey: tk,
                before: dc,
                after: ic,
                changes: diffs,
            });
        }
    }

    // a missing column and a new one of the same type may just be a rename
    const usedNew = new Set<ColumnDesc>();
    const usedOld = new Set<ColumnDesc>();
    for (const old of colPairs.leftOnly) {
        const cands = colPairs.rightOnly.filter(
            (n) => n.type === old.type && !usedNew.has(n)
        );
        const rivals = colPairs.leftOnly.filter(
            (o) => o.type === old.type && !usedOld.has(o)
        );
        if (cands.length === 1 && rivals.length === 1) {
            const n = cands[0];
            usedNew.add(n);
            usedOld.add(old);
            const follow: Change[] = [];
            const diffs = diffColumn(old, n, opts.ignoreComments).filter(
                (f) => f.field !== 'type'
            );
            if (diffs.length > 0) {
                follow.push({
                    id: `column_changed:${tk}.${old.name}`,
                    kind: 'column_changed',
                    tableKey: tk,
                    before: old,
                    after: n,
                    changes: diffs,
                });
            }
            renames.push({
                id: `rename_column:${tk}.${old.name}->${n.name}`,
                entity: 'column',
                tableKey: tk,
                from: old.name,
                to: n.name,
                score: 1,
                followUps: follow,
            });
        }
    }
    for (const c of colPairs.leftOnly) {
        changes.push({
            id: `column_removed:${tk}.${c.name}`,
            kind: 'column_removed',
            tableKey: tk,
            column: c,
        });
    }
    for (const c of colPairs.rightOnly) {
        changes.push({
            id: `column_added:${tk}.${c.name}`,
            kind: 'column_added',
            tableKey: tk,
            column: c,
        });
    }

    // index columns are compared by their database names, so a column renamed
    // locally does not make its indexes look different
    const dbName = (n: string) => nameMap.get(lc(n)) ?? n;
    const dIdx = new Map(
        meaningfulIndexes(d).map((x) => [
            indexSignature({ ...x, columns: x.columns.map(dbName) }),
            x,
        ])
    );
    const iIdx = new Map(
        meaningfulIndexes(i).map((x) => [indexSignature(x), x])
    );
    for (const [sig, ix] of dIdx) {
        if (!iIdx.has(sig)) {
            changes.push({
                id: `index_removed:${tk}.${ix.name}`,
                kind: 'index_removed',
                tableKey: tk,
                index: ix,
            });
        }
    }
    for (const [sig, ix] of iIdx) {
        if (!dIdx.has(sig)) {
            changes.push({
                id: `index_added:${tk}.${ix.name}`,
                kind: 'index_added',
                tableKey: tk,
                index: ix,
            });
        }
    }
    void threshold;
    return changes;
}

export function reconcile(
    diagram: SchemaDesc,
    database: SchemaDesc,
    opts: ReconcileOptions = {}
): ChangeSet {
    const threshold = opts.renameThreshold ?? 0.6;
    const storedTables = opts.sourceKeys?.tables ?? {};
    const changes: Change[] = [];
    const renames: PossibleRename[] = [];

    const tp = pairUp(
        diagram.tables,
        database.tables,
        [
            (t) =>
                t.id && storedTables[t.id] ? lc(storedTables[t.id]) : undefined,
            (t) => lc(t.key),
            (t) => lc(t.name), // schema moved or unqualified: unique name only
        ],
        [(t) => lc(t.key), (t) => lc(t.key), (t) => lc(t.name)]
    );

    const matched: TableMatch[] = [];
    const dToDb = new Map<string, string>();
    const colMaps = new Map<string, Map<string, string>>();
    for (const [d, i] of tp.pairs) {
        matched.push({ diagramKey: d.key, dbKey: i.key, diagramId: d.id });
        dToDb.set(d.key, i.key);
        changes.push(
            ...diffMatchedTable(d, i, opts, threshold, renames, colMaps)
        );
    }

    // rename hints between tables that exist on only one side
    const freeNew = new Set(tp.rightOnly);
    const hintedOld = new Set<TableDesc>();
    const hintedNew = new Set<TableDesc>();
    const candidates: Array<{ d: TableDesc; i: TableDesc; score: number }> = [];
    for (const d of tp.leftOnly) {
        for (const i of freeNew) {
            const score = similarity(d, i);
            if (score >= threshold) candidates.push({ d, i, score });
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const { d, i, score } of candidates) {
        if (hintedOld.has(d) || hintedNew.has(i)) continue;
        hintedOld.add(d);
        hintedNew.add(i);
        renames.push({
            id: `rename_table:${d.key}->${i.key}`,
            entity: 'table',
            tableKey: d.key,
            from: d.key,
            to: i.key,
            score,
            followUps: diffMatchedTable(d, i, opts, threshold, []),
        });
    }

    for (const d of tp.leftOnly) {
        changes.push({
            id: `table_removed:${d.key}`,
            kind: 'table_removed',
            table: d,
        });
    }
    for (const i of tp.rightOnly) {
        changes.push({
            id: `table_added:${i.key}`,
            kind: 'table_added',
            table: i,
        });
    }

    changes.push(...diffRelationships(diagram, database, dToDb, colMaps));

    changes.sort((a, b) => a.id.localeCompare(b.id));
    renames.sort((a, b) => a.id.localeCompare(b.id));
    return { changes, possibleRenames: renames, matched };
}

// --- relationships ------------------------------------------------------------

const relSignature = (r: RelationshipDesc) =>
    `${lc(r.fromTable)}|${r.fromColumns.map(lc).join(',')}|${lc(r.toTable)}|${r.toColumns.map(lc).join(',')}`;
const relNameKey = (r: RelationshipDesc) =>
    `${lc(r.fromTable)}|${lc(r.name)}|${r.fromColumns.map(lc).join(',')}`;

function diffRelationships(
    diagram: SchemaDesc,
    database: SchemaDesc,
    dToDb: Map<string, string>,
    colMaps: Map<string, Map<string, string>>
): Change[] {
    const inDbNames = (table: string, columns: string[]) =>
        columns.map((c) => colMaps.get(table)?.get(lc(c)) ?? c);
    // express diagram relationships in database table names
    const mapped = diagram.relationships
        .filter((r) => dToDb.has(r.fromTable) && dToDb.has(r.toTable))
        .map((r) => ({
            original: r,
            translated: {
                ...r,
                fromTable: dToDb.get(r.fromTable)!,
                toTable: dToDb.get(r.toTable)!,
                fromColumns: inDbNames(r.fromTable, r.fromColumns),
                toColumns: inDbNames(r.toTable, r.toColumns),
            },
        }));

    // a foreign key into a table outside the introspected set (an unselected
    // schema, say) says nothing about the diagram, so it is not reported
    const known = new Set(database.tables.map((t) => t.key));
    const dbRelationships = database.relationships.filter(
        (r) => known.has(r.fromTable) && known.has(r.toTable)
    );

    const out: Change[] = [];
    const usedDb = new Set<RelationshipDesc>();
    const usedDiagram = new Set<RelationshipDesc>();

    // same signature = same relationship (name differences do not matter)
    const dbBySig = new Map<string, RelationshipDesc[]>();
    for (const r of dbRelationships) {
        dbBySig.set(relSignature(r), [
            ...(dbBySig.get(relSignature(r)) ?? []),
            r,
        ]);
    }
    for (const m of mapped) {
        const hit = (dbBySig.get(relSignature(m.translated)) ?? []).find(
            (x) => !usedDb.has(x)
        );
        if (hit) {
            usedDb.add(hit);
            usedDiagram.add(m.original);
        }
    }

    // same name, different columns/tables = the relationship changed
    for (const m of mapped) {
        if (usedDiagram.has(m.original)) continue;
        const hit = dbRelationships.find(
            (x) => !usedDb.has(x) && relNameKey(x) === relNameKey(m.translated)
        );
        if (hit) {
            usedDb.add(hit);
            usedDiagram.add(m.original);
            out.push({
                id: `relationship_changed:${m.original.fromTable}.${m.original.name}.${m.original.fromColumns.join(',')}`,
                kind: 'relationship_changed',
                before: m.original,
                after: hit,
            });
        }
    }

    for (const m of mapped) {
        if (!usedDiagram.has(m.original)) {
            out.push({
                id: `relationship_removed:${m.original.fromTable}.${m.original.name}.${m.original.fromColumns.join(',')}`,
                kind: 'relationship_removed',
                relationship: m.original,
            });
        }
    }
    for (const r of dbRelationships) {
        if (!usedDb.has(r)) {
            out.push({
                id: `relationship_added:${r.fromTable}.${r.name}.${r.fromColumns.join(',')}`,
                kind: 'relationship_added',
                relationship: r,
            });
        }
    }
    return out;
}

// --- helpers ------------------------------------------------------------------

export const isEmpty = (cs: ChangeSet): boolean =>
    cs.changes.length === 0 && cs.possibleRenames.length === 0;

export function countByKind(
    cs: ChangeSet
): Partial<Record<ChangeKind, number>> {
    const counts: Partial<Record<ChangeKind, number>> = {};
    for (const c of cs.changes) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    return counts;
}
