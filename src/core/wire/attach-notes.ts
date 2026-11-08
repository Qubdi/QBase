import { collectionOf, listOf } from '../model/collection';
import type { Design } from '../model/design';
import type { Id } from '../model/id';
import { anchorPoint } from '../model/memo';
import type { Memo, MemoAnchor } from '../model/memo';
import { nearestOwner } from '../model/memo-owner';

/** What a file said about the place of a note, before it is checked against the design. */
export interface NotePlace {
    /** the note's own x and y, as written (where it is on the canvas) */
    x: number;
    y: number;
    /** what the file says it is attached to, if anything */
    anchor?: MemoAnchor;
}

/**
 * Turns the notes read from a file into notes that belong to something. A
 * note the file attaches to an area, table or column that exists keeps it; any
 * other note (a file from before notes were attached, or a broken reference)
 * is attached to the area it lies in or the nearest table, and stays where it
 * is on the canvas. Only a design with no table and no area keeps a free note.
 * `places` holds each note's place as written, by note id; `warn` is told about
 * a reference that points at nothing.
 */
export function attachNotes(
    design: Design,
    places: ReadonlyMap<Id, NotePlace>,
    warn: (id: Id, message: string) => void
): Design {
    const memos = listOf(design.memos).map((memo): Memo => {
        const place = places.get(memo.id);
        if (!place) return memo;
        let anchor = place.anchor;
        let origin = anchor ? anchorPoint(design, anchor) : undefined;
        if (anchor && !origin) {
            warn(
                memo.id,
                'the note is attached to something that does not exist'
            );
            anchor = undefined;
        }
        if (!anchor) {
            const centre = {
                x: place.x + memo.box.width / 2,
                y: place.y + memo.box.height / 2,
            };
            anchor = nearestOwner(design, centre.x, centre.y);
            origin = anchor ? anchorPoint(design, anchor) : undefined;
        }
        if (!anchor || !origin) return memo;
        return {
            ...memo,
            anchor,
            box: {
                ...memo.box,
                x: place.x - origin.x,
                y: place.y - origin.y,
            },
        };
    });
    return { ...design, memos: collectionOf(memos) };
}
