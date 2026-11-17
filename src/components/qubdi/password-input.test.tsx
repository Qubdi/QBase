import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
    it('starts hidden and the eye button shows and hides the text', () => {
        render(<PasswordInput aria-label="Secret" defaultValue="hunter2" />);
        const input = screen.getByLabelText('Secret') as HTMLInputElement;
        expect(input.type).toBe('password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(input.type).toBe('text');
        expect(input.value).toBe('hunter2');

        fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(input.type).toBe('password');
    });

    it('does not submit the form when the eye is pressed', () => {
        let submitted = false;
        render(
            <form onSubmit={() => (submitted = true)}>
                <PasswordInput aria-label="Secret" />
            </form>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(submitted).toBe(false);
    });
});
