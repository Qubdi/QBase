import { beforeEach, describe, expect, it } from 'vitest';
import { readJsonMap } from '../local-map';

describe('readJsonMap', () => {
    beforeEach(() => localStorage.clear());

    it('reads a stored object', () => {
        localStorage.setItem('k', '{"a":"1"}');
        expect(readJsonMap<string>('k')).toEqual({ a: '1' });
    });

    it('is empty for missing, broken, array and scalar values', () => {
        expect(readJsonMap('k')).toEqual({});
        for (const bad of ['{nope', '[1,2]', '7', '"x"', 'null']) {
            localStorage.setItem('k', bad);
            expect(Object.keys(readJsonMap('k'))).toEqual([]);
        }
    });

    it('does not find names that Object.prototype has', () => {
        localStorage.setItem('k', '{"a":"1"}');
        const map = readJsonMap<string>('k');
        expect(map['toString']).toBeUndefined();
        expect(map['constructor']).toBeUndefined();
        expect('hasOwnProperty' in map).toBe(false);
    });

    it('keeps a stored __proto__ key as plain data', () => {
        localStorage.setItem('k', '{"__proto__":"x"}');
        const map = readJsonMap<string>('k');
        expect(map['__proto__']).toBe('x');
        expect(Object.getPrototypeOf(map)).toBeNull();
    });
});
