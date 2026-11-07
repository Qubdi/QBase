import { describe, expect, it } from 'vitest';
import { safeFileName } from '../download-file';

describe('review ui 11: safeFileName', () => {
    it('replaces characters that systems refuse', () => {
        expect(safeFileName('QBase(a/b:c).json')).toBe('QBase(a_b_c).json');
    });
    it('does not leave dots-only, trailing-dot or device names', () => {
        expect(safeFileName('..')).toBe('diagram');
        expect(safeFileName('plan. ')).toBe('plan');
        expect(safeFileName('CON')).toBe('_CON');
        expect(safeFileName('nul.txt')).toBe('_nul.txt');
        expect(safeFileName('console')).toBe('console');
    });
});
