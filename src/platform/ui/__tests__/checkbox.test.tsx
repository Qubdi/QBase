import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../checkbox';
import { Label } from '../label';

/** keeps its own state, as a form that owns the setting does */
const Held: React.FC<{
    start?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean | 'indeterminate') => void;
}> = ({ start = false, disabled, onCheckedChange }) => {
    const [on, setOn] = useState(start);
    return (
        <Label>
            Show grid
            <Checkbox
                checked={on}
                disabled={disabled}
                onCheckedChange={(next) => {
                    onCheckedChange?.(next);
                    setOn(next === true);
                }}
            />
        </Label>
    );
};
const box = () => screen.getByRole('checkbox', { name: 'Show grid' });

describe('Checkbox', () => {
    it('reports whether it is ticked', () => {
        const { rerender } = render(
            <Checkbox checked={false} aria-label="x" />
        );
        const el = screen.getByRole('checkbox', { name: 'x' });
        expect(el.getAttribute('aria-checked')).toBe('false');
        expect(el.getAttribute('data-state')).toBe('unchecked');
        rerender(<Checkbox checked aria-label="x" />);
        expect(el.getAttribute('aria-checked')).toBe('true');
        expect(el.getAttribute('data-state')).toBe('checked');
    });

    it('asks for the opposite when it is clicked, and when Space is pressed', async () => {
        const onCheckedChange = vi.fn();
        render(<Held onCheckedChange={onCheckedChange} />);
        await userEvent.click(box());
        expect(onCheckedChange).toHaveBeenLastCalledWith(true);
        box().focus();
        await userEvent.keyboard(' ');
        expect(onCheckedChange).toHaveBeenLastCalledWith(false);
        expect(box().getAttribute('aria-checked')).toBe('false');
    });

    it('is named by the label around it, and a click on the label ticks it', async () => {
        const onCheckedChange = vi.fn();
        render(<Held onCheckedChange={onCheckedChange} />);
        await userEvent.click(screen.getByText('Show grid'));
        expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
        expect(box().getAttribute('aria-checked')).toBe('true');
    });

    it('does nothing while disabled', async () => {
        const onCheckedChange = vi.fn();
        render(<Held start disabled onCheckedChange={onCheckedChange} />);
        expect(box()).toHaveProperty('disabled', true);
        await userEvent.click(box());
        await userEvent.click(screen.getByText('Show grid'));
        expect(onCheckedChange).not.toHaveBeenCalled();
        expect(box().getAttribute('aria-checked')).toBe('true');
    });

    it('lets a caller add its own classes, as the export dialog does to line the box up', () => {
        render(<Checkbox checked={false} aria-label="x" className="mt-px" />);
        expect(screen.getByRole('checkbox').className).toContain('mt-px');
    });

    // The look chosen in design/checkbox ("Roomier"): see that folder before changing these
    describe('the Roomier look', () => {
        it('is an 18 px box with a 6 px corner and a 1.5 px border', () => {
            render(<Checkbox checked={false} aria-label="x" />);
            const cls = screen.getByRole('checkbox').className;
            expect(cls).toContain('size-[18px]');
            expect(cls).toContain('rounded-[6px]');
            expect(cls).toContain('border-[1.5px]');
            // no longer the 16 px box with the 4 px corner
            expect(cls).not.toContain('h-4 w-4');
            expect(cls).not.toContain('rounded-[4px]');
        });

        it('fills with the primary colour when ticked', () => {
            render(<Checkbox checked aria-label="x" />);
            const cls = screen.getByRole('checkbox').className;
            expect(cls).toContain('data-[state=checked]:bg-primary');
            expect(cls).toContain('data-[state=checked]:border-primary');
            expect(cls).toContain(
                'data-[state=checked]:text-primary-foreground'
            );
        });

        it('draws a bold tick smaller than the box, only while ticked', () => {
            const { rerender } = render(
                <Checkbox checked={false} aria-label="x" />
            );
            expect(
                screen.getByRole('checkbox').querySelector('svg')
            ).toBeNull();
            rerender(<Checkbox checked aria-label="x" />);
            const tick = screen.getByRole('checkbox').querySelector('svg');
            expect(tick).not.toBeNull();
            // 14 px in an 18 px box, stroke 3: space around it
            expect(tick?.getAttribute('class')).toContain('size-3.5');
            expect(tick?.getAttribute('stroke-width')).toBe('3');
        });

        it('only strengthens its border on hover while it is unticked and enabled', () => {
            render(<Checkbox checked={false} aria-label="x" />);
            expect(screen.getByRole('checkbox').className).toContain(
                'data-[state=unchecked]:enabled:hover:border-muted-foreground/85'
            );
        });
    });
});
