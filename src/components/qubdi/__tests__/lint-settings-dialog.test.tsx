import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LintSettingsDialog } from '../lint-settings-dialog';

const show = () =>
    render(
        <LintSettingsDialog
            open
            onOpenChange={() => undefined}
            config={{}}
            onSave={() => undefined}
        />
    );

// the text and severity of a rule sit next to its checkbox
const textOf = (box: HTMLElement) => box.nextElementSibling as HTMLElement;

describe('LintSettingsDialog checkboxes', () => {
    it('opens with the dialog focused, not with a checkbox picked out', () => {
        show();
        expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    it('dims a rule that is switched off', () => {
        show();
        // "Table without a description" is off by default
        const off = screen.getByRole('checkbox', {
            name: 'Enable Table without a description',
        });
        const on = screen.getByRole('checkbox', {
            name: 'Enable Table without a primary key',
        });
        expect(textOf(off).className).toContain('opacity-60');
        expect(textOf(on).className).not.toContain('opacity-60');
    });

    it('stops dimming a rule once it is switched on', () => {
        show();
        const box = screen.getByRole('checkbox', {
            name: 'Enable Table without a description',
        });
        fireEvent.click(box);
        expect(textOf(box).className).not.toContain('opacity-60');
    });
});
