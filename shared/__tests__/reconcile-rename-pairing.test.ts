import { describe, expect, it } from 'vitest';
import { reconcile } from '../reconcile';
import type { ColumnDesc, SchemaDesc, TableDesc } from '../schema-desc';

const col = (name: string, type = 'integer'): ColumnDesc => ({
    name,
    type,
    nullable: true,
    primaryKey: false,
    unique: false,
    default: null,
    length: null,
    precision: null,
    scale: null,
    identity: false,
    comment: null,
});

const table = (name: string, columns: ColumnDesc[]): TableDesc => ({
    key: `public.${name}`,
    schema: 'public',
    name,
    isView: false,
    comment: null,
    columns,
    indexes: [],
});

const schema = (tables: TableDesc[]): SchemaDesc => ({
    tables,
    relationships: [],
});

// the earlier pairing: score every left table against every right table
function oldRenames(
    left: TableDesc[],
    right: TableDesc[],
    threshold: number
): string[] {
    const sig = (c: ColumnDesc) => `${c.name.toLowerCase()}:${c.type}`;
    const score = (a: TableDesc, b: TableDesc) => {
        const sa = new Set(a.columns.map(sig));
        const sb = new Set(b.columns.map(sig));
        if (sa.size === 0 && sb.size === 0) return 0;
        let both = 0;
        for (const s of sa) if (sb.has(s)) both++;
        return both / (sa.size + sb.size - both);
    };
    const cands: Array<{ d: TableDesc; i: TableDesc; s: number }> = [];
    for (const d of left)
        for (const i of right) {
            const s = score(d, i);
            if (s >= threshold) cands.push({ d, i, s });
        }
    cands.sort((a, b) => b.s - a.s);
    const od = new Set<TableDesc>();
    const oi = new Set<TableDesc>();
    const out: string[] = [];
    for (const { d, i } of cands) {
        if (od.has(d) || oi.has(i)) continue;
        od.add(d);
        oi.add(i);
        out.push(`rename_table:${d.key}->${i.key}`);
    }
    return out.sort((a, b) => a.localeCompare(b));
}

describe('table rename pairing', () => {
    it('pairs a thousand and more renamed tables in well under a second', () => {
        const n = 4000;
        const mk = (prefix: string) =>
            Array.from({ length: n }, (_, k) =>
                table(`${prefix}${k}`, [
                    col('id'),
                    col('name', 'text'),
                    col(`f${k}_a`),
                    col(`f${k}_b`),
                    col(`f${k}_c`),
                ])
            );
        const start = performance.now();
        const set = reconcile(schema(mk('a')), schema(mk('b')));
        const ms = performance.now() - start;
        expect(set.possibleRenames).toHaveLength(n);
        expect(set.possibleRenames[0].entity).toBe('table');
        expect(ms).toBeLessThan(1000);
    });

    it('gives the same pairs as scoring every pair, on random small schemas', () => {
        let seed = 11;
        const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
        const pool = ['id', 'name', 'a', 'b', 'c', 'd', 'e', 'f'];
        const make = (prefix: string, count: number) =>
            Array.from({ length: count }, (_, k) => {
                const cols = new Set<string>();
                const len = next() % 6;
                for (let x = 0; x < len; x++)
                    cols.add(pool[next() % pool.length]);
                return table(
                    `${prefix}${k}`,
                    [...cols].map((c) =>
                        col(c, next() % 5 === 0 ? 'text' : 'integer')
                    )
                );
            });
        for (let round = 0; round < 60; round++) {
            const left = make('l', 1 + (next() % 9));
            const right = make('r', 1 + (next() % 9));
            const set = reconcile(schema(left), schema(right));
            expect(set.possibleRenames.map((r) => r.id)).toEqual(
                oldRenames(left, right, 0.6)
            );
        }
    });
});
