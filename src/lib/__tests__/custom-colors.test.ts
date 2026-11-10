import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    addColor,
    CUSTOM_COLORS_KEY,
    MAX_CUSTOM_COLORS,
    normalizeHex,
    parseSaved,
    removeColor,
    writeSavedColors,
} from '../custom-colors';

describe('normalizeHex', () => {
    it('accepts 6 digit colors with or without the hash, in any case', () => {
        expect(normalizeHex('#8EB7FF')).toBe('#8eb7ff');
        expect(normalizeHex('8eb7ff')).toBe('#8eb7ff');
        expect(normalizeHex('  #AbCdEf  ')).toBe('#abcdef');
    });

    it('expands 3 digit colors', () => {
        expect(normalizeHex('#8bf')).toBe('#88bbff');
        expect(normalizeHex('FA0')).toBe('#ffaa00');
    });

    it('rejects everything that is not a hex color', () => {
        for (const bad of [
            '',
            '#',
            '#12',
            '#1234',
            '#12345',
            '#1234567',
            '#gggggg',
            'red',
            'rgb(1,2,3)',
            '#12 34 56',
            '##123456',
        ]) {
            expect(normalizeHex(bad), bad).toBeNull();
        }
    });
});

describe('addColor', () => {
    it('puts the new color first', () => {
        expect(addColor(['#111111'], '#222222')).toEqual([
            '#222222',
            '#111111',
        ]);
    });

    it('moves a color that is already saved to the front, ignoring case', () => {
        expect(
            addColor(['#111111', '#222222'], '#222222'.toUpperCase())
        ).toEqual(['#222222', '#111111']);
    });

    it('normalises what it stores', () => {
        expect(addColor([], '8BF')).toEqual(['#88bbff']);
    });

    it('ignores an invalid color', () => {
        const list = ['#111111'];
        expect(addColor(list, 'nope')).toBe(list);
    });

    it('keeps only the newest colors once the limit is reached', () => {
        let list: string[] = [];
        for (let i = 0; i < MAX_CUSTOM_COLORS + 3; i++) {
            list = addColor(list, `#${String(i).padStart(6, '0')}`);
        }
        expect(list).toHaveLength(MAX_CUSTOM_COLORS);
        expect(list[0]).toBe(
            `#${String(MAX_CUSTOM_COLORS + 2).padStart(6, '0')}`
        );
        expect(list).not.toContain('#000000');
    });
});

describe('removeColor', () => {
    it('removes one color and leaves the rest', () => {
        expect(removeColor(['#111111', '#222222'], '#111111')).toEqual([
            '#222222',
        ]);
        expect(removeColor(['#111111'], '#111111'.toUpperCase())).toEqual([]);
        expect(removeColor(['#111111'], '#999999')).toEqual(['#111111']);
    });
});

describe('parseSaved', () => {
    it('reads a saved list', () => {
        expect(parseSaved('["#111111","#222222"]')).toEqual([
            '#111111',
            '#222222',
        ]);
    });

    it('survives missing, broken or wrongly shaped data', () => {
        expect(parseSaved(null)).toEqual([]);
        expect(parseSaved('')).toEqual([]);
        expect(parseSaved('{oops')).toEqual([]);
        expect(parseSaved('{"a":1}')).toEqual([]);
        expect(parseSaved('"#111111"')).toEqual([]);
    });

    it('drops invalid and duplicate entries and normalises the rest', () => {
        expect(
            parseSaved('["#ABC","nope",5,null,"#aabbcc","#112233"]')
        ).toEqual(['#aabbcc', '#112233']);
    });

    it('never returns more than the limit', () => {
        const many = Array.from(
            { length: 40 },
            (_, i) => `#${String(i).padStart(6, '0')}`
        );
        expect(parseSaved(JSON.stringify(many))).toHaveLength(
            MAX_CUSTOM_COLORS
        );
    });
});

describe('storage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

    beforeEach(() => localStorage.clear());
    afterEach(() => Object.defineProperty(window, 'localStorage', original));

    /** A storage that throws, like a browser with storage blocked or full. */
    const breakStorage = (broken: { get?: boolean; set?: boolean }) =>
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            value: {
                getItem: () => {
                    if (broken.get) throw new Error('blocked');
                    return null;
                },
                setItem: () => {
                    if (broken.set) throw new Error('quota');
                },
            },
        });

    it('writes the colors to localStorage', () => {
        expect(writeSavedColors(['#112233'])).toBe(true);
        expect(localStorage.getItem(CUSTOM_COLORS_KEY)).toBe('["#112233"]');
    });

    it('reports failure instead of throwing when the browser refuses to store', () => {
        breakStorage({ set: true });
        expect(writeSavedColors(['#112233'])).toBe(false);
    });
});
