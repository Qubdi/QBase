import { describe, expect, it } from 'vitest';
import { isPermissive } from './permissive.mjs';

describe('isPermissive', () => {
    it.each(['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', '0BSD', 'MIT-0'])(
        'accepts the single licence %s',
        (license) => expect(isPermissive(license)).toBe(true)
    );

    it('accepts an expression whose every id is permissive', () => {
        expect(isPermissive('(MIT OR Apache-2.0)')).toBe(true);
        expect(isPermissive('(BSD-2-Clause AND MIT)')).toBe(true);
    });

    it('does not accept an expression with a licence that needs review', () => {
        expect(isPermissive('(MIT OR GPL-3.0)')).toBe(false);
        expect(isPermissive('(MIT AND CC-BY-NC-4.0)')).toBe(false);
        expect(isPermissive('(Elastic-2.0)')).toBe(false);
    });

    it('does not accept a licence that is not clearly permissive', () => {
        for (const license of [
            'OFL-1.1',
            'UNKNOWN',
            'NOT INSTALLED',
            'GPL-3.0',
            '',
            'SEE LICENSE IN LICENSE',
        ])
            expect(isPermissive(license)).toBe(false);
    });
});
