import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OptionSelect } from '../option-select';
import {
    EMPTY_VALUE,
    fromInternalValue,
    toInternalValue,
    type SelectOption,
} from '../option-select-values';

// Radix Select expects a few pointer and scroll APIs that happy-dom lacks
beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

const roles: SelectOption[] = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
];

const open = (name: string) =>
    fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: ' ' });

describe('empty value mapping', () => {
    const withNone: SelectOption[] = [
        { value: '', label: 'None' },
        { value: 'a', label: 'A' },
    ];

    it('maps an empty value to a name Radix accepts, only when there is a None option', () => {
        expect(toInternalValue('', withNone)).toBe(EMPTY_VALUE);
        expect(toInternalValue('a', withNone)).toBe('a');
        expect(toInternalValue('', roles)).toBe('');
    });

    it('maps it back', () => {
        expect(fromInternalValue(EMPTY_VALUE)).toBe('');
        expect(fromInternalValue('editor')).toBe('editor');
    });
});

describe('OptionSelect', () => {
    it('shows the label of the selected option', () => {
        render(
            <OptionSelect
                aria-label="Role"
                value="editor"
                onValueChange={vi.fn()}
                options={roles}
            />
        );
        expect(
            screen.getByRole('combobox', { name: 'Role' }).textContent
        ).toContain('Editor');
    });

    it('shows the placeholder when nothing is chosen', () => {
        render(
            <OptionSelect
                aria-label="Role"
                value=""
                placeholder="Choose a role"
                onValueChange={vi.fn()}
                options={roles}
            />
        );
        expect(
            screen.getByRole('combobox', { name: 'Role' }).textContent
        ).toContain('Choose a role');
    });

    it('lists the options and reports the one chosen', async () => {
        const onValueChange = vi.fn();
        render(
            <OptionSelect
                aria-label="Role"
                value="viewer"
                onValueChange={onValueChange}
                options={roles}
            />
        );
        open('Role');
        const editor = await screen.findByRole('option', { name: 'Editor' });
        expect(screen.getByRole('option', { name: 'Viewer' })).toBeTruthy();
        fireEvent.keyDown(editor, { key: 'Enter' });
        expect(onValueChange).toHaveBeenCalledWith('editor');
    });

    it('reports an empty choice as an empty string', async () => {
        const onValueChange = vi.fn();
        render(
            <OptionSelect
                aria-label="Connection"
                value="a"
                onValueChange={onValueChange}
                options={[
                    { value: '', label: 'Enter details manually' },
                    { value: 'a', label: 'prod' },
                ]}
            />
        );
        open('Connection');
        fireEvent.keyDown(
            await screen.findByRole('option', {
                name: 'Enter details manually',
            }),
            { key: 'Enter' }
        );
        expect(onValueChange).toHaveBeenCalledWith('');
    });

    it('shows the empty option as selected when the value is empty', () => {
        render(
            <OptionSelect
                aria-label="Connection"
                value=""
                onValueChange={vi.fn()}
                options={[
                    { value: '', label: 'Enter details manually' },
                    { value: 'a', label: 'prod' },
                ]}
            />
        );
        expect(
            screen.getByRole('combobox', { name: 'Connection' }).textContent
        ).toContain('Enter details manually');
    });

    it('does not open when disabled', () => {
        render(
            <OptionSelect
                aria-label="Role"
                value="viewer"
                disabled
                onValueChange={vi.fn()}
                options={roles}
            />
        );
        open('Role');
        expect(screen.queryByRole('option')).toBeNull();
        expect(
            (
                screen.getByRole('combobox', {
                    name: 'Role',
                }) as HTMLButtonElement
            ).disabled
        ).toBe(true);
    });

    it('skips options that are disabled', async () => {
        const onValueChange = vi.fn();
        render(
            <OptionSelect
                aria-label="Role"
                value="viewer"
                onValueChange={onValueChange}
                options={[
                    { value: 'viewer', label: 'Viewer' },
                    { value: 'editor', label: 'Editor', disabled: true },
                ]}
            />
        );
        open('Role');
        const editor = await screen.findByRole('option', { name: 'Editor' });
        expect(editor.getAttribute('aria-disabled')).toBe('true');
    });
});
