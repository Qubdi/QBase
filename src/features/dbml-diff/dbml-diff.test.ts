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

    it('a changed field makes the table changed; a rename is removed plus added', () => {
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
        expect(again.tables.removed.map((id) => nameOf(s1, id))).toEqual([
            'customers',
        ]);
        expect(again.tables.added.map((id) => nameOf(renamed, id))).toEqual([
            'clients',
        ]);
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
