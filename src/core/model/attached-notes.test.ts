import { describe, expect, it } from 'vitest';
import { apply } from '../commands/apply';
import type { Command } from '../commands/command';
import { planAddNote, planAddRegion } from '../commands/plan-visual';
import { applyOk, NOW, rng, sameButDate, withTables } from '../testing/helpers';
import { parse } from '../wire/parse';
import { relabel } from '../wire/relabel';
import { serialise } from '../wire/serialise';
import type { Design } from './design';
import {
    anchorPoint,
    boxAt,
    COLUMN_ROW_HEIGHT,
    MEMO_GAP,
    memoPosition,
    TABLE_HEADER_HEIGHT,
} from './memo';
import type { Memo, MemoAnchor } from './memo';

/** Two tables far apart, an area around the first, and one more column on the first. */
function scene(): Design {
    let d = withTables(['orders', 'items']);
    const [a, b] = d.entities.order;
    d = applyOk(d, {
        type: 'entity.move',
        moves: [{ id: a, x: 100, y: 200 }],
    }).design;
    d = applyOk(d, {
        type: 'entity.move',
        moves: [{ id: b, x: 900, y: 200 }],
    }).design;
    d = applyOk(
        d,
        planAddRegion(d, {
            box: { x: 50, y: 100, width: 400, height: 300 },
            random: rng(5),
        })
    ).design;
    return d;
}

let seed = 100;

function add(d: Design, anchor: MemoAnchor): { design: Design; memo: Memo } {
    const command = planAddNote(d, anchor, { random: rng(++seed) });
    const design = applyOk(d, command).design;
    const memo = Object.values(design.memos.byId).at(-1)!;
    return { design, memo };
}

const columnOf = (d: Design, entityIndex: number, column = 0) =>
    d.entities.byId[d.entities.order[entityIndex]].columnIds[column];

describe('where an attached note is', () => {
    it('is measured from the corner of an area, a table or a column row', () => {
        const d = scene();
        const [a] = d.entities.order;
        const region = d.regions.order[0];
        expect(anchorPoint(d, { kind: 'region', id: region })).toMatchObject({
            x: 50,
            y: 100,
        });
        expect(anchorPoint(d, { kind: 'entity', id: a })).toEqual({
            x: 100,
            y: 200,
        });
        expect(
            anchorPoint(d, { kind: 'column', id: columnOf(d, 0, 0) })
        ).toEqual({ x: 100, y: 200 + TABLE_HEADER_HEIGHT });
    });

    it('a new note is put to the right of what it belongs to', () => {
        const d = scene();
        const { memo, design } = add(d, {
            kind: 'entity',
            id: d.entities.order[0],
        });
        expect(memo.anchor).toEqual({
            kind: 'entity',
            id: d.entities.order[0],
        });
        expect(memoPosition(design, memo).x).toBe(100 + 224 + MEMO_GAP);
        expect(memoPosition(design, memo).y).toBe(200);
        const area = add(d, { kind: 'region', id: d.regions.order[0] });
        expect(memoPosition(area.design, area.memo).x).toBe(
            50 + 400 + MEMO_GAP
        );
    });

    it('moves with its table, and with the area when the area is moved', () => {
        const d = scene();
        const [a] = d.entities.order;
        const { memo, design } = add(d, { kind: 'entity', id: a });
        const moved = applyOk(design, {
            type: 'entity.move',
            moves: [{ id: a, x: 500, y: 700 }],
        }).design;
        expect(memoPosition(moved, moved.memos.byId[memo.id])).toEqual({
            x: 500 + 224 + MEMO_GAP,
            y: 700,
        });
        const area = add(d, { kind: 'region', id: d.regions.order[0] });
        const withArea = applyOk(area.design, {
            type: 'item.update',
            collection: 'regions',
            id: d.regions.order[0],
            patch: { box: { x: 250, y: 100, width: 400, height: 300 } },
        }).design;
        expect(
            memoPosition(withArea, withArea.memos.byId[area.memo.id]).x
        ).toBe(250 + 400 + MEMO_GAP);
    });

    it('follows its column when the columns change places', () => {
        let d = scene();
        const a = d.entities.order[0];
        const added = applyOk(d, {
            type: 'part.insert',
            part: 'columns',
            entityId: a,
            item: {
                ...d.columns[columnOf(d, 0, 0)],
                id: 'second',
                name: 'second',
                primaryKey: false,
            },
        });
        d = added.design;
        const second = columnOf(d, 0, 1);
        const { memo, design } = add(d, { kind: 'column', id: second });
        expect(memoPosition(design, memo).y).toBe(
            200 + TABLE_HEADER_HEIGHT + COLUMN_ROW_HEIGHT
        );
        const swapped = applyOk(design, {
            type: 'part.reorder',
            part: 'columns',
            entityId: a,
            ids: [second, columnOf(design, 0, 0)],
        }).design;
        expect(memoPosition(swapped, swapped.memos.byId[memo.id]).y).toBe(
            200 + TABLE_HEADER_HEIGHT
        );
    });

    it('a drop at a place keeps the distance to what it belongs to', () => {
        const d = scene();
        const { memo, design } = add(d, {
            kind: 'entity',
            id: d.entities.order[0],
        });
        const box = boxAt(design, memo, { x: 700, y: 650 });
        expect(box).toMatchObject({ x: 700 - 100, y: 650 - 200 });
        const next = { ...memo, box };
        expect(memoPosition(design, next)).toEqual({ x: 700, y: 650 });
    });
});

describe('notes go with what they belong to', () => {
    const restoreAndCompare = (before: Design, command: Command) => {
        const done = applyOk(before, command);
        const undone = applyOk(done.design, done.inverse);
        expect(sameButDate(undone.design, before)).toEqual(before);
        return done.design;
    };

    it('deleting a table deletes its notes and those of its columns, and undo brings them back', () => {
        let d = scene();
        const [a, b] = d.entities.order;
        d = add(d, { kind: 'entity', id: a }).design;
        d = add(d, { kind: 'column', id: columnOf(d, 0) }).design;
        d = add(d, { kind: 'entity', id: b }).design;
        expect(d.memos.order).toHaveLength(3);
        const after = restoreAndCompare(d, { type: 'entity.remove', id: a });
        expect(after.memos.order).toHaveLength(1);
        expect(after.memos.byId[after.memos.order[0]].anchor?.id).toBe(b);
    });

    it('deleting several tables at once does the same, in one undo step', () => {
        let d = scene();
        const [a, b] = d.entities.order;
        d = add(d, { kind: 'entity', id: a }).design;
        d = add(d, { kind: 'entity', id: b }).design;
        const after = restoreAndCompare(d, {
            type: 'group',
            commands: [
                { type: 'entity.remove', id: a },
                { type: 'entity.remove', id: b },
            ],
        });
        expect(after.memos.order).toHaveLength(0);
    });

    it('deleting a column deletes its notes only', () => {
        let d = scene();
        const a = d.entities.order[0];
        d = add(d, { kind: 'column', id: columnOf(d, 0) }).design;
        d = add(d, { kind: 'entity', id: a }).design;
        const after = restoreAndCompare(d, {
            type: 'part.remove',
            part: 'columns',
            entityId: a,
            id: columnOf(d, 0),
        });
        expect(after.memos.order).toHaveLength(1);
        expect(after.memos.byId[after.memos.order[0]].anchor?.kind).toBe(
            'entity'
        );
    });

    it('deleting an area deletes its notes but not its tables', () => {
        let d = scene();
        const region = d.regions.order[0];
        d = add(d, { kind: 'region', id: region }).design;
        d = add(d, { kind: 'entity', id: d.entities.order[1] }).design;
        const after = restoreAndCompare(d, {
            type: 'item.remove',
            collection: 'regions',
            id: region,
        });
        expect(after.memos.order).toHaveLength(1);
        expect(after.entities.order).toHaveLength(2);
    });

    it('refuses a note attached to something that is not there', () => {
        const d = scene();
        const result = apply(
            d,
            planAddNote(d, { kind: 'entity', id: 'nowhere' }),
            { now: NOW }
        );
        expect(result.ok).toBe(false);
    });
});

describe('notes in a saved file', () => {
    const file = (d: Design) => serialise(d);

    it('keep what they belong to and where they are, through a save and a read', () => {
        let d = scene();
        const [a] = d.entities.order;
        d = add(d, { kind: 'entity', id: a }).design;
        d = add(d, { kind: 'column', id: columnOf(d, 0) }).design;
        d = add(d, { kind: 'region', id: d.regions.order[0] }).design;
        const raw = file(d);
        const notes = raw.notes as Record<string, unknown>[];
        expect(notes.map((n) => n.anchorType)).toEqual([
            'table',
            'field',
            'area',
        ]);
        // x and y are where the note is on the canvas, as older readers expect
        expect(notes[0]).toMatchObject({ x: 100 + 224 + MEMO_GAP, y: 200 });
        const again = parse(raw, { now: NOW, random: rng() });
        expect(again.warnings).toEqual([]);
        expect(again.design.memos).toEqual(d.memos);
        expect(file(again.design)).toEqual(raw);
    });

    it('a note of an older file is attached to the area it lies in', () => {
        const d = scene();
        const raw = file(d) as Record<string, unknown>;
        const read = parse(
            {
                ...raw,
                notes: [
                    {
                        id: 'free',
                        content: 'old',
                        x: 120,
                        y: 120,
                        width: 200,
                        height: 150,
                        color: '#ffe374',
                    },
                ],
            },
            { now: NOW, random: rng() }
        ).design;
        const memo = read.memos.byId.free;
        expect(memo.anchor).toEqual({ kind: 'region', id: d.regions.order[0] });
        expect(memoPosition(read, memo)).toEqual({ x: 120, y: 120 });
    });

    it('a note outside every area is attached to the nearest table', () => {
        const d = scene();
        const [, b] = d.entities.order;
        const raw = file(d) as Record<string, unknown>;
        const read = parse(
            {
                ...raw,
                notes: [
                    {
                        id: 'free',
                        content: 'old',
                        x: 1200,
                        y: 260,
                        width: 200,
                        height: 150,
                        color: '#ffe374',
                    },
                ],
            },
            { now: NOW, random: rng() }
        ).design;
        expect(read.memos.byId.free.anchor).toEqual({ kind: 'entity', id: b });
        expect(memoPosition(read, read.memos.byId.free)).toEqual({
            x: 1200,
            y: 260,
        });
    });

    it('a note stays free only when the design has no table and no area', () => {
        const raw = {
            ...(file(withTables([])) as Record<string, unknown>),
            notes: [
                {
                    id: 'free',
                    content: 'alone',
                    x: 5,
                    y: 6,
                    width: 200,
                    height: 150,
                    color: '#ffe374',
                },
            ],
        };
        const read = parse(raw, { now: NOW, random: rng() }).design;
        expect(read.memos.byId.free.anchor).toBeUndefined();
        expect(memoPosition(read, read.memos.byId.free)).toEqual({
            x: 5,
            y: 6,
        });
    });

    it('a note attached to something missing is attached again, with a warning', () => {
        const d = scene();
        const raw = file(d) as Record<string, unknown>;
        const read = parse(
            {
                ...raw,
                notes: [
                    {
                        id: 'lost',
                        content: 'x',
                        x: 120,
                        y: 120,
                        width: 200,
                        height: 150,
                        color: '#ffe374',
                        anchorType: 'table',
                        anchorId: 'gone',
                    },
                ],
            },
            { now: NOW, random: rng() }
        );
        expect(read.warnings.some((w) => w.path === 'notes')).toBe(true);
        expect(read.design.memos.byId.lost.anchor?.kind).toBe('region');
    });

    it('new ids for every record keep each note on what it belonged to', () => {
        let d = scene();
        d = add(d, { kind: 'column', id: columnOf(d, 0) }).design;
        let counter = 0;
        const moved = relabel(d, (kind) => `${kind}-${++counter}`);
        const memo = moved.memos.byId[moved.memos.order[0]];
        expect(memo.anchor?.kind).toBe('column');
        expect(moved.columns[memo.anchor!.id]).toBeDefined();
        expect(memoPosition(moved, memo)).toEqual(
            memoPosition(d, d.memos.byId[d.memos.order[0]])
        );
    });
});
