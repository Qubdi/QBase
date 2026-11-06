import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { FieldTypeLegend } from '../field-type-legend';

describe('FieldTypeLegend', () => {
    it('reads its text from the translations', async () => {
        render(<FieldTypeLegend />);
        const button = screen.getByRole('button', {
            name: i18n.t('qubdi.workspace.typeLegend.button'),
        });
        fireEvent.click(button);
        for (const kind of ['text', 'number', 'time', 'id', 'bool', 'json']) {
            expect(
                await screen.findByText(
                    i18n.t(`qubdi.workspace.typeLegend.${kind}`)
                )
            ).toBeTruthy();
        }
    });
});
