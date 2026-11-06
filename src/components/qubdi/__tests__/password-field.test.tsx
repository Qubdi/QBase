import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordField } from '../password-field';

const Harness: React.FC<{ email?: string; minLength?: number }> = ({
    email,
    minLength = 12,
}) => {
    const [value, setValue] = useState('');
    return (
        <PasswordField
            value={value}
            onChange={setValue}
            minLength={minLength}
            email={email}
            placeholder="New password"
        />
    );
};

const rules = () =>
    within(screen.getByRole('list', { name: 'Password rules' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent);

const type = (value: string) =>
    fireEvent.change(screen.getByLabelText('New password'), {
        target: { value },
    });

describe('PasswordField', () => {
    it('lists every rule as not met for an empty password', () => {
        render(<Harness />);
        expect(rules()).toEqual([
            'At least 12 characters (not met)',
            'A capital letter (not met)',
            'A number (not met)',
            'A symbol, such as ! or # (not met)',
        ]);
    });

    it('says the real minimum length', () => {
        render(<Harness minLength={16} />);
        expect(rules()[0]).toContain('At least 16 characters');
    });

    it('ticks each rule as it is met', () => {
        render(<Harness />);
        type('Abcdefghijkl');
        expect(rules()).toEqual([
            'At least 12 characters (met)',
            'A capital letter (met)',
            'A number (not met)',
            'A symbol, such as ! or # (not met)',
        ]);
        type('Abcdefghijk1!');
        expect(rules().every((r) => r?.endsWith('(met)'))).toBe(true);
    });

    it('adds the email rule only with an email, and ticks it off', () => {
        const { unmount } = render(<Harness />);
        expect(rules().join()).not.toContain('email');
        unmount();

        render(<Harness email="anna.smith@corp.io" />);
        expect(rules().at(-1)).toBe('Not your email address (met)');
        type('My-Anna.Smith-99');
        expect(rules().at(-1)).toBe('Not your email address (not met)');
    });

    it('hides what is typed and does not offer to remember it', () => {
        render(<Harness />);
        const input = screen.getByLabelText('New password');
        expect(input.getAttribute('type')).toBe('password');
        expect(input.getAttribute('autocomplete')).toBe('new-password');
    });

    it('ties the checklist to the input for a screen reader', () => {
        render(<Harness />);
        const list = screen.getByRole('list', { name: 'Password rules' });
        expect(
            screen
                .getByLabelText('New password')
                .getAttribute('aria-describedby')
        ).toBe(list.id);
    });
});
