import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RULES, type LintConfig } from '../../../../shared/lint';
import { LintSettingsDialog } from '../lint-settings-dialog';

const show = (config: LintConfig = {}, open = true) => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    const view = render(
        <LintSettingsDialog
            open={open}
            onOpenChange={onOpenChange}
            config={config}
            onSave={onSave}
        />
    );
    return { ...view, onSave, onOpenChange };
};

const DEFAULT_ON = RULES.filter((r) => r.defaultEnabled).length;
const count = () => screen.getByText(/ of \d+ on$/).textContent;
const save = () =>
    userEvent.click(screen.getByRole('button', { name: 'Save' }));
const pick = async (combobox: string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: combobox }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
};
const pk = RULES[0];

describe('LintSettingsDialog saving', () => {
    it('lists every rule with its title, description and default severity', () => {
        show();
        for (const r of RULES) {
            expect(
                screen.getByRole('checkbox', { name: `Enable ${r.title}` })
            ).toBeInTheDocument();
            expect(screen.getByText(r.description)).toBeInTheDocument();
        }
        expect(
            screen.getByRole('combobox', { name: `Severity for ${pk.title}` })
        ).toHaveTextContent('Error');
        expect(count()).toBe(`${DEFAULT_ON} of ${RULES.length} on`);
    });

    it('starts from the saved settings', () => {
        show({
            rules: { [pk.id]: { enabled: false, severity: 'info' } },
            naming: { style: 'camelCase', tables: 'plural' },
        });
        expect(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        ).not.toBeChecked();
        expect(
            screen.getByRole('combobox', { name: `Severity for ${pk.title}` })
        ).toHaveTextContent('Info');
        expect(
            screen.getByRole('combobox', { name: 'Name style' })
        ).toHaveTextContent('camelCase');
        expect(
            screen.getByRole('combobox', { name: 'Table names' })
        ).toHaveTextContent('Plural');
        expect(count()).toBe(`${DEFAULT_ON - 1} of ${RULES.length} on`);
    });

    it('saves a rule switched off and a changed severity, then closes', async () => {
        const { onSave, onOpenChange } = show();
        await userEvent.click(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        );
        expect(count()).toBe(`${DEFAULT_ON - 1} of ${RULES.length} on`);
        await pick(`Severity for ${RULES[1].title}`, 'Info');
        await save();
        expect(onSave).toHaveBeenCalledWith({
            rules: {
                [pk.id]: { enabled: false },
                [RULES[1].id]: { severity: 'info' },
            },
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('saves the naming choices', async () => {
        const { onSave } = show();
        expect(
            screen.getByRole('combobox', { name: 'Name style' })
        ).toHaveTextContent('Detect from the diagram');
        expect(
            screen.getByRole('combobox', { name: 'Table names' })
        ).toHaveTextContent('Consistent');
        await pick('Name style', 'snake_case');
        await pick('Table names', 'Do not check');
        await save();
        expect(onSave).toHaveBeenCalledWith({
            naming: { style: 'snake_case', tables: 'any' },
        });
    });

    it('keeps the other naming choice when one changes', async () => {
        const { onSave } = show({ naming: { style: 'camelCase' } });
        await pick('Table names', 'Singular');
        await save();
        expect(onSave).toHaveBeenCalledWith({
            naming: { style: 'camelCase', tables: 'singular' },
        });
    });

    it('drops values that are not settings before saving', async () => {
        const { onSave } = show({
            rules: {
                [pk.id]: { severity: 'fatal' as never },
                'no-such-rule': { enabled: false },
            } as never,
        });
        await save();
        expect(onSave).toHaveBeenCalledWith({ rules: { [pk.id]: {} } });
    });

    it('Reset to defaults clears the draft, and saving it saves no overrides', async () => {
        const { onSave } = show({
            rules: { [pk.id]: { enabled: false } },
            naming: { style: 'camelCase' },
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Reset to defaults' })
        );
        expect(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        ).toBeChecked();
        expect(count()).toBe(`${DEFAULT_ON} of ${RULES.length} on`);
        await save();
        expect(onSave).toHaveBeenCalledWith({});
    });

    it('Cancel closes without saving', async () => {
        const { onSave, onOpenChange } = show();
        await userEvent.click(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        );
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('Escape closes without saving', () => {
        const { onSave, onOpenChange } = show();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSave).not.toHaveBeenCalled();
    });

    it('a space on a focused rule switches it', async () => {
        show();
        const box = screen.getByRole('checkbox', {
            name: `Enable ${pk.title}`,
        });
        box.focus();
        await userEvent.keyboard(' ');
        expect(box).not.toBeChecked();
    });

    it('throws away unsaved changes when it is closed and opened again', async () => {
        const config: LintConfig = {};
        const view = show(config);
        await userEvent.click(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        );
        const tree = (open: boolean) => (
            <LintSettingsDialog
                open={open}
                onOpenChange={() => undefined}
                config={config}
                onSave={() => undefined}
            />
        );
        view.rerender(tree(false));
        view.rerender(tree(true));
        expect(
            await screen.findByRole('checkbox', { name: `Enable ${pk.title}` })
        ).toBeChecked();
    });

    it('takes new saved settings while open', () => {
        const view = show({});
        view.rerender(
            <LintSettingsDialog
                open
                onOpenChange={() => undefined}
                config={{ rules: { [pk.id]: { enabled: false } } }}
                onSave={() => undefined}
            />
        );
        expect(
            screen.getByRole('checkbox', { name: `Enable ${pk.title}` })
        ).not.toBeChecked();
    });
});
