import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Label } from '../label';
import { Switch } from '../switch';

/** keeps its own state, as a form that owns the setting does */
const Held: React.FC<{
    start?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}> = ({ start = false, disabled, onCheckedChange }) => {
    const [on, setOn] = useState(start);
    return (
        <Label>
            Allow null
            <Switch
                checked={on}
                disabled={disabled}
                onCheckedChange={(next) => {
                    onCheckedChange?.(next);
                    setOn(next);
                }}
            />
        </Label>
    );
};
const sw = () => screen.getByRole('switch', { name: 'Allow null' });

describe('Switch', () => {
    it('is a switch that reports whether it is on', () => {
        const { rerender } = render(<Switch checked={false} aria-label="x" />);
        const el = screen.getByRole('switch', { name: 'x' });
        expect(el.getAttribute('aria-checked')).toBe('false');
        expect(el.getAttribute('data-state')).toBe('unchecked');
        rerender(<Switch checked aria-label="x" />);
        expect(el.getAttribute('aria-checked')).toBe('true');
        expect(el.getAttribute('data-state')).toBe('checked');
    });

    it('is not a submit button: it never sends the form around it', () => {
        render(<Switch checked={false} aria-label="x" />);
        expect(screen.getByRole('switch').getAttribute('type')).toBe('button');
    });

    it('asks for the opposite of what it shows when it is clicked', async () => {
        const onCheckedChange = vi.fn();
        render(<Held start onCheckedChange={onCheckedChange} />);
        await userEvent.click(sw());
        expect(onCheckedChange).toHaveBeenLastCalledWith(false);
        expect(sw().getAttribute('aria-checked')).toBe('false');
        await userEvent.click(sw());
        expect(onCheckedChange).toHaveBeenLastCalledWith(true);
        expect(sw().getAttribute('aria-checked')).toBe('true');
    });

    it('does not change itself: it shows what it is given', async () => {
        render(
            <Switch
                checked={false}
                onCheckedChange={() => undefined}
                aria-label="x"
            />
        );
        await userEvent.click(screen.getByRole('switch'));
        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
            'false'
        );
    });

    it('works from the keyboard with Space and Enter', async () => {
        const onCheckedChange = vi.fn();
        render(<Held onCheckedChange={onCheckedChange} />);
        sw().focus();
        await userEvent.keyboard(' ');
        expect(onCheckedChange).toHaveBeenLastCalledWith(true);
        await userEvent.keyboard('{Enter}');
        expect(onCheckedChange).toHaveBeenLastCalledWith(false);
        expect(onCheckedChange).toHaveBeenCalledTimes(2);
    });

    it('is named by the label around it, and a click on the label flips it', async () => {
        const onCheckedChange = vi.fn();
        render(<Held onCheckedChange={onCheckedChange} />);
        await userEvent.click(screen.getByText('Allow null'));
        expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
        expect(sw().getAttribute('aria-checked')).toBe('true');
    });

    it('does nothing while disabled, by click, label or keyboard', async () => {
        const onCheckedChange = vi.fn();
        render(<Held start disabled onCheckedChange={onCheckedChange} />);
        expect(sw()).toHaveProperty('disabled', true);
        await userEvent.click(sw());
        await userEvent.click(screen.getByText('Allow null'));
        sw().focus();
        await userEvent.keyboard(' ');
        expect(onCheckedChange).not.toHaveBeenCalled();
        expect(sw().getAttribute('aria-checked')).toBe('true');
    });

    it('lets a click handler of its own cancel the change', async () => {
        const onCheckedChange = vi.fn();
        render(
            <Switch
                checked={false}
                aria-label="x"
                onClick={(e) => e.preventDefault()}
                onCheckedChange={onCheckedChange}
            />
        );
        await userEvent.click(screen.getByRole('switch'));
        expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('hands its ref and extra props on to the button', () => {
        const ref = React.createRef<HTMLButtonElement>();
        render(
            <Switch
                ref={ref}
                checked={false}
                aria-label="x"
                data-testid="probe"
                className="extra"
            />
        );
        expect(ref.current).toBe(screen.getByTestId('probe'));
        expect(ref.current?.className).toContain('extra');
    });
});
