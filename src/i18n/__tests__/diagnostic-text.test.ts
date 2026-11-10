import { describe, expect, it } from 'vitest';
import { diagnosticText } from '@/lib/diagnostic-text';
import { INVALID_JSON_MESSAGE } from '@/formats/metadata/repair-text';

describe('diagnosticText', () => {
    it('shows known engine messages from the language files', () => {
        expect(diagnosticText('Nothing to import')).toBe('Nothing to import');
        expect(diagnosticText(INVALID_JSON_MESSAGE)).toBe(INVALID_JSON_MESSAGE);
        expect(diagnosticText('Found 1 table to import.')).toBe(
            'Found 1 table to import.'
        );
        expect(diagnosticText('Found 2 tables and 1 view to import.')).toBe(
            'Found 2 tables and 1 view to import.'
        );
        expect(
            diagnosticText(
                'Line 3: SERIAL is not valid in MySQL, use AUTO_INCREMENT'
            )
        ).toBe('Line 3: SERIAL is not valid in MySQL, use AUTO_INCREMENT');
        expect(
            diagnosticText(
                'Foreign key on a dropped: its columns do not match.'
            )
        ).toBe('Foreign key on a dropped: its columns do not match.');
        expect(
            diagnosticText('Invalid check on t: Unterminated quoted text')
        ).toBe('Invalid check on t: Unterminated quoted text');
        expect(
            diagnosticText(
                '3 foreign key row(s) dropped: a table or column is not in the import.'
            )
        ).toBe(
            '3 foreign key rows dropped: a table or column is not in the import.'
        );
    });

    it('leaves an unknown message as the engine wrote it', () => {
        expect(diagnosticText('Unexpected token near "x"')).toBe(
            'Unexpected token near "x"'
        );
    });
});
