import { describe, expect, it } from 'vitest';
import { createEntityParts } from '@/core/model/defaults';
import { blank, NOW, rng } from '@/core/testing/helpers';
import { sizeFor } from './geometry';
import { createMeasureBook } from './measure-book';

const entity = (x: number, width?: number) => {
    const parts = createEntityParts(blank('postgresql'), {
        name: 't',
        x,
        y: 0,
        now: NOW,
        random: rng(3),
    });
    return { ...parts.entity, width };
};

// The old canvas copied each node's measured size onto the nodes it rebuilt.
// The new canvas keeps measured sizes in a book keyed by id, so a rebuilt
// entity gets its size back by lookup. These tests keep the old rules.
describe('measure book', () => {
    it('gives a rebuilt entity the size its previous version had', () => {
        const book = createMeasureBook();
        const before = entity(0);
        book.getState().report(before.id, { width: 200, height: 90 });
        const rebuilt = { ...before, x: 40 };
        expect(sizeFor(rebuilt, book.getState().sizes).height).toBe(90);
    });

    it('keeps a width the entity itself has, and the measured height', () => {
        const book = createMeasureBook();
        const e = entity(0, 300);
        book.getState().report(e.id, { width: 200, height: 90 });
        expect(sizeFor(e, book.getState().sizes)).toEqual({
            width: 300,
            height: 90,
        });
    });

    it('matches by id: another entity never gets the size', () => {
        const book = createMeasureBook();
        const a = entity(0);
        book.getState().report(a.id, { width: 1, height: 1 });
        const other = { ...entity(0), id: 'other' };
        expect(book.getState().sizes[other.id]).toBeUndefined();
    });

    it('invents nothing for an entity that was never measured', () => {
        const book = createMeasureBook();
        expect(book.getState().sizes).toEqual({});
    });

    it('drops the size of an entity that has gone and leaves the rest', () => {
        const book = createMeasureBook();
        book.getState().report('a', { width: 1, height: 1 });
        book.getState().report('gone', { width: 5, height: 5 });
        book.getState().forget('gone');
        expect(book.getState().sizes).toEqual({
            a: { width: 1, height: 1 },
        });
    });

    it('reports no change for an equal size, so the canvas can skip the update', () => {
        const book = createMeasureBook();
        expect(book.getState().report('a', { width: 10, height: 20 })).toBe(
            true
        );
        const before = book.getState().sizes;
        expect(book.getState().report('a', { width: 10.2, height: 19.8 })).toBe(
            false
        );
        expect(book.getState().sizes).toBe(before);
    });
});
