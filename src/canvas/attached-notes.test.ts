import { describe, expect, it } from 'vitest';
import type { Design } from '@/core/model/design';
import type { MemoAnchor } from '@/core/model/memo';
import { memoPosition } from '@/core/model/memo';
import { createEditorStore } from '@/store/editor-store';
import { addNoteTo, deleteSelection } from './canvas-actions';
import { commitShapes } from './commit-shapes';
import { buildNodes } from './flow-model';
import type { FlowInput, LiveShapes } from './flow-model';
import { runMenuAction } from './menu-actions';
import { buildMenu } from './menu-model';
import { shop, withRegion } from './test/fixtures';

const NONE: LiveShapes = { positions: {}, sizes: {} };

const input = (design: Design, live: LiveShapes = NONE): FlowInput => ({
    design,
    selection: new Set(),
    visible: new Set(design.entities.order),
    live,
    flashing: new Set(),
    overlapping: new Set(),
    sizes: {},
    outlineOverlaps: false,
    editable: true,
});

function withNote(
    kind: MemoAnchor['kind'],
    pick: (s: ReturnType<typeof shop>) => string
) {
    const s = shop();
    const store = createEditorStore({ design: s.design });
    const id = addNoteTo(store, { kind, id: pick(s) })!;
    return { s, store, id };
}

const noteNode = (design: Design, id: string, live?: LiveShapes) =>
    buildNodes(input(design, live)).find((n) => n.id === id)!;

describe('attached notes on the canvas', () => {
    it('are drawn where their table puts them, with a line back to it', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        const design = store.getState().design;
        // orders is at 300,0 and 224 wide: the note is 24 to its right
        expect(noteNode(design, id).position).toEqual({ x: 548, y: 0 });
        expect(noteNode(design, id).data).toEqual({ tieX: -24, tieY: 24 });
        void s;
    });

    it('move with their table while it is dragged', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        const live = {
            positions: { [s.orders]: { x: 400, y: 100 } },
            sizes: {},
        };
        const node = noteNode(store.getState().design, id, live);
        expect(node.position).toEqual({ x: 648, y: 100 });
        expect(node.data).toEqual({ tieX: -24, tieY: 24 });
    });

    it('a column note is level with the column row and follows its table', () => {
        const { s, store, id } = withNote('column', (x) => x.orderUser);
        const design = store.getState().design;
        // orders has the id column first, user_id second
        expect(noteNode(design, id).position).toEqual({
            x: 548,
            y: 48 + 32,
        });
        const moved = noteNode(design, id, {
            positions: { [s.orders]: { x: 300, y: 500 } },
            sizes: {},
        });
        expect(moved.position).toEqual({ x: 548, y: 500 + 48 + 32 });
        // the line ends in the middle of the row
        expect(noteNode(design, id).data).toEqual({ tieX: -24, tieY: 16 });
    });

    it('an area note follows the area when the area is dragged', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 500,
            height: 600,
        });
        const store = createEditorStore({ design: placed.design });
        const id = addNoteTo(store, { kind: 'region', id: placed.regionId })!;
        const design = store.getState().design;
        expect(noteNode(design, id).position).toEqual({ x: 1524, y: 1000 });
        expect(
            noteNode(design, id, {
                positions: { [placed.regionId]: { x: 0, y: 2000 } },
                sizes: {},
            }).position
        ).toEqual({ x: 524, y: 2000 });
    });

    it('a note that is dragged itself is where the pointer puts it', () => {
        const { store, id } = withNote('entity', (x) => x.orders);
        const node = noteNode(store.getState().design, id, {
            positions: { [id]: { x: 700, y: 300 } },
            sizes: {},
        });
        expect(node.position).toEqual({ x: 700, y: 300 });
    });
});

describe('what a drag leaves behind for attached notes', () => {
    it('moving the table sends no change for its note: the note follows by itself', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        const design = store.getState().design;
        const command = commitShapes(design, {
            positions: { [s.orders]: { x: 400, y: 100 } },
            sizes: {},
        })!;
        store.getState().edit(command);
        const after = store.getState().design;
        expect(after.memos.byId[id].box).toEqual(design.memos.byId[id].box);
        expect(memoPosition(after, after.memos.byId[id])).toEqual({
            x: 648,
            y: 100,
        });
    });

    it('moving the note keeps its distance from the table, in one undo step', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        const design = store.getState().design;
        store.getState().edit(
            commitShapes(design, {
                positions: { [id]: { x: 900, y: 80 } },
                sizes: {},
            })!
        );
        const after = store.getState().design;
        expect(after.memos.byId[id].box).toMatchObject({ x: 600, y: 80 });
        // the table moves later: the note keeps the new distance
        store.getState().edit({
            type: 'entity.move',
            moves: [{ id: s.orders, x: 0, y: 0 }],
        });
        const later = store.getState().design;
        expect(memoPosition(later, later.memos.byId[id])).toEqual({
            x: 600,
            y: 80,
        });
        store.getState().undo();
        store.getState().undo();
        expect(store.getState().design.memos.byId[id].box).toMatchObject({
            x: 248,
            y: 0,
        });
    });

    it('moving the table and its note together leaves the distance as it was', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        const design = store.getState().design;
        const before = design.memos.byId[id].box;
        const command = commitShapes(design, {
            positions: {
                [s.orders]: { x: 400, y: 100 },
                [id]: { x: 648, y: 100 },
            },
            sizes: {},
        });
        store.getState().edit(command!);
        expect(store.getState().design.memos.byId[id].box).toEqual(before);
    });

    it('resizing a note keeps its size and place relative to the table', () => {
        const { store, id } = withNote('entity', (x) => x.orders);
        const design = store.getState().design;
        store.getState().edit(
            commitShapes(design, {
                positions: {},
                sizes: { [id]: { width: 300, height: 200 } },
            })!
        );
        expect(store.getState().design.memos.byId[id].box).toEqual({
            x: 248,
            y: 0,
            width: 300,
            height: 200,
        });
    });
});

describe('making and deleting attached notes', () => {
    it('a table, a column and an area menu line each add a note to that item', () => {
        const s = shop();
        const placed = withRegion(s.design, {
            x: 1000,
            y: 1000,
            width: 500,
            height: 600,
        });
        const store = createEditorStore({ design: placed.design });
        const context = (
            target: Parameters<typeof buildMenu>[0]['target']
        ) => ({
            design: store.getState().design,
            selection: [],
            target,
            at: { x: 0, y: 0 },
            showViews: true,
            canOpenLinkDialog: true,
            canEditEntity: true,
        });
        for (const target of [
            { kind: 'entity', id: s.users },
            { kind: 'region', id: placed.regionId },
        ] as const) {
            const line = buildMenu(context(target)).find(
                (l) => l.kind === 'item' && l.label === 'addNote'
            );
            expect(line).toBeDefined();
            if (line?.kind !== 'item' || !line.action) throw new Error('none');
            runMenuAction(line.action, {
                store,
                startEditing: () => undefined,
                beginLink: () => undefined,
                askArrange: () => undefined,
            } as unknown as Parameters<typeof runMenuAction>[1]);
        }
        const d = store.getState().design;
        expect(d.memos.order.map((m) => d.memos.byId[m].anchor)).toEqual([
            { kind: 'entity', id: s.users },
            { kind: 'region', id: placed.regionId },
        ]);
    });

    it('a table menu opened on one of its fields offers the note for that field, and only that', () => {
        const s = shop();
        const column = s.design.entities.byId[s.orders].columnIds[0];
        const lines = buildMenu({
            design: s.design,
            selection: [],
            target: { kind: 'entity', id: s.orders, columnId: column },
            at: { x: 0, y: 0 },
            showViews: true,
            canOpenLinkDialog: true,
            canEditEntity: true,
        });
        const notes = lines.flatMap((l) =>
            l.kind === 'item' && /Note$/.test(l.label) ? [l] : []
        );
        expect(notes.map((l) => l.label)).toEqual(['addFieldNote']);
        expect(notes[0].action).toEqual({
            type: 'new-note',
            anchor: { kind: 'column', id: column },
        });
    });

    it('a field that is not in the table the menu is for falls back to the table note', () => {
        const s = shop();
        const other = s.design.entities.byId[s.users].columnIds[0];
        const lines = buildMenu({
            design: s.design,
            selection: [],
            target: { kind: 'entity', id: s.orders, columnId: other },
            at: { x: 0, y: 0 },
            showViews: true,
            canOpenLinkDialog: true,
            canEditEntity: true,
        });
        const note = lines.find(
            (l) => l.kind === 'item' && /Note$/.test(l.label)
        );
        expect(note?.kind === 'item' && note.label).toBe('addNote');
        expect(note?.kind === 'item' && note.action).toEqual({
            type: 'new-note',
            anchor: { kind: 'entity', id: s.orders },
        });
    });

    it('the pane menu has no note line: a note needs an owner', () => {
        const s = shop();
        const lines = buildMenu({
            design: s.design,
            selection: [],
            target: { kind: 'pane' },
            at: { x: 0, y: 0 },
            showViews: true,
            canOpenLinkDialog: true,
            canEditEntity: true,
        });
        expect(
            lines.some((l) => l.kind === 'item' && l.label === 'addNote')
        ).toBe(false);
    });

    it('deleting a table and its selected note together works, and undo brings both back', () => {
        const { s, store, id } = withNote('entity', (x) => x.orders);
        store.getState().select([s.orders, id]);
        expect(deleteSelection(store)).toBe(true);
        const d = store.getState().design;
        expect(d.entities.byId[s.orders]).toBeUndefined();
        expect(d.memos.order).toHaveLength(0);
        store.getState().undo();
        const back = store.getState().design;
        expect(back.entities.byId[s.orders]).toBeDefined();
        expect(back.memos.byId[id]).toBeDefined();
    });
});
