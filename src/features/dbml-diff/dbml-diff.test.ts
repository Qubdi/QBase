import { describe, expect, it } from 'vitest';
import { listOf } from '@/core/model/collection';
import type { Design } from '@/core/model/design';
import {
    sampleS1,
    sampleS2,
    sampleS3,
} from '@/dialects/testing/sample-designs';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { importDbml } from '@/formats/dbml/import-dbml';
import { apply } from '@/core/commands/apply';
import { createEntityParts } from '@/core/model/defaults';
import { NOW, rng } from '@/core/testing/helpers';
import { buildProposal } from './build-proposal';
import { diffDesigns } from './diff-designs';

const s1 = sampleS1('postgresql');

function edited(design: Design, change: (text: string) => string) {
    const text = change(exportDbml(design).text);
    const imported = importDbml(text, design.databaseType);
    expect(imported.diagnostics).toEqual([]);
    return imported.design!;
}

/** the text without the orders table and without any Ref line */
const dropOrders = (t: string) =>
    t
        .replace(/Table "orders" \{[\s\S]*?\n\}\n/, '')
        .split('\n')
        .filter((l) => !l.startsWith('Ref'))
        .join('\n');

const nameOf = (d: Design, id: string) => d.entities.byId[id].name;

describe('EDT-241 diffDesigns', () => {
    it.each([
        ['S1', s1],
        ['S2', sampleS2('postgresql')],
        ['S3', sampleS3('postgresql')],
    ] as const)('%s: unedited text gives an empty diff', (_n, design) => {
        const diff = diffDesigns(
            design,
            edited(design, (t) => t)
        );
        expect(diff.empty).toBe(true);
        expect(diff.tables.same).toHaveLength(design.entities.order.length);
    });

    it('a new table is added', () => {
        const next = edited(
            s1,
            (t) => `${t}\nTable "extra" {\n  "id" integer [pk]\n}\n`
        );
        const diff = diffDesigns(s1, next);
        expect(diff.tables.added.map((id) => nameOf(next, id))).toEqual([
            'extra',
        ]);
        expect(diff.tables.removed).toEqual([]);
        expect(diff.empty).toBe(false);
    });

    it('a table that is gone is removed, with its relationships', () => {
        const next = edited(s1, dropOrders);
        const diff = diffDesigns(s1, next);
        expect(diff.tables.removed.map((id) => nameOf(s1, id))).toEqual([
            'orders',
        ]);
        expect(diff.links.removed).toHaveLength(1);
        expect(diff.links.added).toEqual([]);
    });

    it('a changed field makes the table changed; a rename is one renamed table', () => {
        const changed = edited(s1, (t) =>
            t.replace('"email" varchar(120)', '"email" varchar(200)')
        );
        const diff = diffDesigns(s1, changed);
        expect(diff.tables.changed.map((p) => nameOf(s1, p.current))).toEqual([
            'customers',
        ]);
        const renamed = edited(s1, (t) =>
            t.replace(/"customers"/g, '"clients"')
        );
        const again = diffDesigns(s1, renamed);
        expect(again.tables.removed).toEqual([]);
        expect(again.tables.added).toEqual([]);
        expect(
            again.tables.renamed.map((p) => [
                nameOf(s1, p.current),
                nameOf(renamed, p.parsed),
            ])
        ).toEqual([['customers', 'clients']]);
        expect(again.tables.changed).toHaveLength(1);
        // the lines to it follow the new name
        expect(again.links.added).toEqual([]);
        expect(again.links.removed).toEqual([]);
        // a rename together with a changed field is not a rename
        const both = edited(s1, (t) =>
            t
                .replace(/"customers"/g, '"clients"')
                .replace('"email" varchar(120)', '"email" varchar(200)')
        );
        const split = diffDesigns(s1, both);
        expect(split.tables.renamed).toEqual([]);
        expect(split.tables.removed).toHaveLength(1);
        expect(split.tables.added).toHaveLength(1);
    });

    it('a dropped Ref line is a removed link', () => {
        const next = edited(s1, (t) =>
            t
                .split('\n')
                .filter((l) => !l.startsWith('Ref'))
                .join('\n')
        );
        const diff = diffDesigns(s1, next);
        expect(diff.links.removed).toHaveLength(1);
        expect(diff.tables.changed).toEqual([]);
    });

    it('custom types: added, removed and changed by name', () => {
        const s3 = sampleS3('postgresql');
        const next = edited(s3, (t) =>
            t.replace('"open"', '"open"\n    "waiting"')
        );
        expect(diffDesigns(s3, next).types.changed).toEqual([
            'public.ticket_status',
        ]);
        const without = edited(s3, (t) => t.replace(/Enum[^}]*}\n?/, ''));
        const gone = diffDesigns(s3, {
            ...without,
            userTypes: { byId: {}, order: [] },
        });
        expect(gone.types.removed).toEqual(['public.ticket_status']);
    });
});

describe('EDT-245 buildProposal', () => {
    const next = edited(
        s1,
        (t) => `${t}\nTable "extra" {\n  "id" integer [pk]\n}\n`
    );
    const diff = diffDesigns(s1, next);
    const proposal = buildProposal(s1, next, diff);

    it('matching tables keep id, position and colour; new tables land right of all', () => {
        for (const id of s1.entities.order) {
            const kept = proposal.accepted.entities.byId[id];
            expect(kept).toMatchObject({
                x: s1.entities.byId[id].x,
                y: s1.entities.byId[id].y,
                color: s1.entities.byId[id].color,
            });
        }
        const extra = listOf(proposal.accepted.entities).find(
            (e) => e.name === 'extra'
        )!;
        const right = Math.max(
            ...listOf(s1.entities).map((e) => e.x + (e.width ?? 224))
        );
        expect(extra.x).toBeGreaterThanOrEqual(right + 150);
        expect(proposal.tables[extra.id]).toBe('added');
        expect(proposal.accepted.links.order).toHaveLength(1);
    });

    it('the preview keeps removed tables and marks removed links', () => {
        const drop = edited(s1, (t) =>
            t
                .split('\n')
                .filter((l) => !l.startsWith('Ref'))
                .join('\n')
        );
        const d = diffDesigns(s1, drop);
        const p = buildProposal(s1, drop, d);
        expect(Object.values(p.links)).toEqual(['removed']);
        expect(p.preview.links.order).toHaveLength(1);
        expect(p.accepted.links.order).toHaveLength(0);

        const gone = edited(s1, dropOrders);
        const q = buildProposal(s1, gone, diffDesigns(s1, gone));
        const ghost = listOf(q.preview.entities).find(
            (e) => e.name === 'orders'
        )!;
        expect(Object.values(q.tables)).toEqual(['removed']);
        expect(q.tables[ghost.id]).toBe('removed');
        expect(q.accepted.entities.byId[ghost.id]).toBeUndefined();
        expect(Object.values(q.links)).toEqual(['removed']);
    });

    it('the accepted design is one replace command with an exact inverse', () => {
        const done = apply(s1, {
            type: 'design.replace',
            design: proposal.accepted,
        });
        if (!done.ok) throw new Error('refused');
        const back = apply(done.design, done.inverse);
        if (!back.ok) throw new Error('refused');
        expect({ ...back.design, updatedAt: 0 }).toEqual({
            ...s1,
            updatedAt: 0,
        });
    });
});

describe('EDT-245 relationship names survive accepted DBML edits', () => {
    it('does not grow an fk_<n>_ prefix on every round trip', () => {
        const name = listOf(s1.links)[0].name;
        let design = s1;
        for (let i = 0; i < 3; i += 1) {
            const next = edited(
                design,
                (t) => `${t}\nTable "x${i}" {\n  "id" integer [pk]\n}\n`
            );
            const proposal = buildProposal(
                design,
                next,
                diffDesigns(design, next)
            );
            design = proposal.accepted;
        }
        expect(listOf(design.links)[0].name).toBe(name);
    });
});

describe('EDT-242 a renamed table keeps its place and says so', () => {
    it('keeps id and position, and gives the old name for the canvas', () => {
        const renamed = edited(s1, (t) =>
            t.replace(/"customers"/g, '"clients"')
        );
        const p = buildProposal(s1, renamed, diffDesigns(s1, renamed));
        const old = listOf(s1.entities).find((e) => e.name === 'customers')!;
        expect(p.accepted.entities.byId[old.id]).toMatchObject({
            name: 'clients',
            x: old.x,
            y: old.y,
        });
        expect(p.tables[old.id]).toBe('changed');
        expect(p.renames).toEqual({ [old.id]: 'customers' });
        // the line to it is neither added nor removed
        expect(p.links).toEqual({});
        expect(p.accepted.links.order).toHaveLength(1);
    });
});

describe('a table without fields survives an accepted DBML edit', () => {
    it('is not removed and keeps its place', () => {
        const parts = createEntityParts(s1, {
            name: 'bare',
            x: 5,
            y: 7,
            now: NOW,
            random: rng(987654),
        });
        const added = apply(s1, { type: 'entity.insert', parts });
        if (!added.ok) throw new Error(added.message);
        const empty = apply(added.design, {
            type: 'part.remove',
            entityId: parts.entity.id,
            part: 'columns',
            id: parts.entity.columnIds[0],
        });
        if (!empty.ok) throw new Error(empty.message);
        const base = empty.design;
        expect(base.entities.byId[parts.entity.id].columnIds).toHaveLength(0);
        const text = exportDbml(base).text.replace('integer', 'bigint');
        const parsed = importDbml(text, base.databaseType).design!;
        const diff = diffDesigns(base, parsed);
        expect(diff.tables.removed).not.toContain(parts.entity.id);
        const p = buildProposal(base, parsed, diff);
        expect(p.accepted.entities.byId[parts.entity.id]).toMatchObject({
            name: 'bare',
            x: 5,
            y: 7,
        });
        // unedited text: nothing to do
        const same = importDbml(exportDbml(base).text, base.databaseType);
        expect(diffDesigns(base, same.design!).empty).toBe(true);
    });
});
