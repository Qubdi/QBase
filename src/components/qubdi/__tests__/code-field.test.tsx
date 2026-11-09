import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeField } from '../code-field';

const input = (name: string) =>
    screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('CodeField', () => {
    it('is a digits box that a phone can fill from a message', () => {
        render(<CodeField value="" onChange={() => undefined} />);
        const box = input('Authenticator code');
        expect(box.getAttribute('autocomplete')).toBe('one-time-code');
        expect(box.getAttribute('inputmode')).toBe('numeric');
        expect(box.getAttribute('pattern')).toBe('[0-9 ]*');
        expect(box.maxLength).toBe(7);
        expect(box.placeholder).toBe('6-digit code');
    });

    it('is plain text for a recovery code', () => {
        render(<CodeField value="" onChange={() => undefined} recovery />);
        const box = input('Recovery code');
        expect(box.getAttribute('autocomplete')).toBe('off');
        expect(box.getAttribute('inputmode')).toBe('text');
        expect(box.hasAttribute('pattern')).toBe(false);
        expect(box.maxLength).toBe(20);
    });

    it('takes either kind where it does not matter which is typed', () => {
        render(<CodeField value="" onChange={() => undefined} either />);
        const box = input('Authenticator code');
        expect(box.getAttribute('inputmode')).toBe('text');
        expect(box.maxLength).toBe(20);
    });

    it('is required, uses a given label and reports what is typed', () => {
        const onChange = vi.fn();
        render(<CodeField value="" onChange={onChange} label="Code" />);
        const box = input('Code');
        expect(box.required).toBe(true);
        fireEvent.change(box, { target: { value: '123456' } });
        expect(onChange).toHaveBeenCalledWith('123456');
    });
});
