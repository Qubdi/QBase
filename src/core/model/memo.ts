import type { ExtraKeys } from './column';
import type { Design } from './design';
import { TABLE_WIDTH } from './entity';
import type { Box } from './region';
import type { Id } from './id';

/** What a note is attached to. */
export type AnchorKind = 'region' | 'entity' | 'column';

/** The area, table or column a note belongs to, and so moves with. */
export interface MemoAnchor {
    kind: AnchorKind;
    id: Id;
}

/**
 * A sticky note: free text on a coloured card. A note belongs to an area, a
 * table or a column (`anchor`): then `box.x` and `box.y` are its distance from
 * the anchor point (see `anchorPoint`), so the note moves with what it belongs
 * to. A note without an anchor is placed by `box` as it is; only a file from an
 * older version, with nothing to attach the note to, has one.
 */
export interface Memo {
    id: Id;
    box: Box;
    tint: string;
    body: string;
    anchor?: MemoAnchor;
    extra?: ExtraKeys;
}

export const MEMO_SIZE = { width: 200, height: 150 };
export const MEMO_TINT = '#ffe374';

/** Space between a note and what it belongs to when it is first put there. */
export const MEMO_GAP = 24;

/** Height of a table's title bar and of one column row, as drawn. */
export const TABLE_HEADER_HEIGHT = 48;
export const COLUMN_ROW_HEIGHT = 32;

export interface Point {
    x: number;
    y: number;
}

/** Positions that are not yet in the design (a drag in progress), by id. */
export type MovedItems = Readonly<Record<Id, Point | undefined>>;

/**
 * The corner a note is measured from: the top-left of an area or a table, or
 * the top-left of a column's row. Undefined when the anchor points at nothing.
 */
export function anchorPoint(
    design: Design,
    anchor: MemoAnchor,
    moved: MovedItems = {}
): Point | undefined {
    if (anchor.kind === 'region') {
        const region = design.regions.byId[anchor.id];
        const at = region && (moved[anchor.id] ?? region.box);
        return at && { x: at.x, y: at.y };
    }
    if (anchor.kind === 'entity') {
        const entity = design.entities.byId[anchor.id];
        const at = entity && (moved[anchor.id] ?? entity);
        return at && { x: at.x, y: at.y };
    }
    for (const id of design.entities.order) {
        const entity = design.entities.byId[id];
        const index = entity.columnIds.indexOf(anchor.id);
        if (index < 0) continue;
        const at = moved[id] ?? entity;
        return {
            x: at.x,
            y: at.y + TABLE_HEADER_HEIGHT + index * COLUMN_ROW_HEIGHT,
        };
    }
    return undefined;
}

/** Where a note's top-left corner is on the canvas. */
export function memoPosition(
    design: Design,
    memo: Memo,
    moved: MovedItems = {}
): Point {
    const origin = memo.anchor
        ? anchorPoint(design, memo.anchor, moved)
        : undefined;
    return origin
        ? { x: origin.x + memo.box.x, y: origin.y + memo.box.y }
        : { x: memo.box.x, y: memo.box.y };
}

/** The box that goes in `Memo.box` for a note whose top-left corner is at `at`. */
export function boxAt(
    design: Design,
    memo: Memo,
    at: Point,
    moved: MovedItems = {}
): Box {
    const origin = memo.anchor
        ? anchorPoint(design, memo.anchor, moved)
        : undefined;
    return {
        ...memo.box,
        x: at.x - (origin?.x ?? 0),
        y: at.y - (origin?.y ?? 0),
    };
}

/** How wide the area or table an anchor points at is. */
function widthOf(design: Design, anchor: MemoAnchor): number {
    if (anchor.kind === 'region')
        return design.regions.byId[anchor.id]?.box.width ?? 0;
    const entity =
        anchor.kind === 'entity'
            ? design.entities.byId[anchor.id]
            : design.entities.order
                  .map((id) => design.entities.byId[id])
                  .find((e) => e.columnIds.includes(anchor.id));
    return entity?.width ?? TABLE_WIDTH.default;
}

/** The first place for a new note: to the right of what it belongs to. */
export function firstOffset(design: Design, anchor: MemoAnchor): Point {
    return { x: widthOf(design, anchor) + MEMO_GAP, y: 0 };
}

/** Does the anchor point at something the design has? */
export function anchorExists(design: Design, anchor: MemoAnchor): boolean {
    return anchorPoint(design, anchor) !== undefined;
}

/** The notes that belong to any of the areas, tables or columns with these ids. */
export function memosAnchoredTo(design: Design, ids: ReadonlySet<Id>): Memo[] {
    return design.memos.order
        .map((id) => design.memos.byId[id])
        .filter((m) => m.anchor !== undefined && ids.has(m.anchor.id));
}

/**
 * The point on its owner that a note's line ends at: on the owner's right edge
 * when the note is to the right of it, else on its left edge; at the height of
 * the table's title, the column's row or the top of the area. Undefined for a
 * note with no owner.
 */
export function tiePoint(
    design: Design,
    memo: Memo,
    at: Point,
    moved: MovedItems = {}
): Point | undefined {
    const anchor = memo.anchor;
    const origin = anchor && anchorPoint(design, anchor, moved);
    if (!anchor || !origin) return undefined;
    const width = widthOf(design, anchor);
    const down =
        anchor.kind === 'region'
            ? 12
            : anchor.kind === 'column'
              ? COLUMN_ROW_HEIGHT / 2
              : TABLE_HEADER_HEIGHT / 2;
    return {
        x: at.x >= origin.x + width ? origin.x + width : origin.x,
        y: origin.y + down,
    };
}
