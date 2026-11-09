import { describe, expect, it } from 'vitest';
import type { Neutral } from './contract';
import { writeNeutral } from './write-neutral';

const binary = (length: number, varying: boolean): Neutral => ({
    kind: 'binary',
    length,
    varying,
});
const write = (n: Neutral, flavour: 'mysql' | 'sqlserver') =>
    writeNeutral(n, flavour, { keySized: false });

describe('binary lengths stay inside what the target allows', () => {
    it('keeps a length that fits', () => {
        expect(write(binary(16, false), 'mysql').text).toBe('BINARY(16)');
        expect(write(binary(8000, true), 'sqlserver').text).toBe(
            'VARBINARY(8000)'
        );
    });

    it('turns a MySQL BINARY over 255 bytes into VARBINARY, with a note', () => {
        const res = write(binary(300, false), 'mysql');
        expect(res.text).toBe('VARBINARY(300)');
        expect(res.notes).toHaveLength(1);
    });

    it('turns a MySQL VARBINARY over 65535 bytes into LONGBLOB', () => {
        expect(write(binary(70000, true), 'mysql').text).toBe('LONGBLOB');
    });

    it('turns a SQL Server binary over 8000 bytes into VARBINARY(MAX)', () => {
        for (const varying of [false, true])
            expect(write(binary(9000, varying), 'sqlserver').text).toBe(
                'VARBINARY(MAX)'
            );
    });
});
