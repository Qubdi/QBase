import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DebouncedInput } from './debounced-input';

describe('review ui 4: DebouncedInput keeps the last text', () => {
    it('hands over the pending text when it is unmounted before the pause ends', () => {
        vi.useFakeTimers();
        const onCommit = vi.fn();
        const view = render(
            <DebouncedInput
                aria-label="name"
                value=""
                delay={1000}
                onCommit={onCommit}
            />
        );
        fireEvent.change(screen.getByLabelText('name'), {
            target: { value: 'abc' },
        });
        vi.advanceTimersByTime(200);
        view.unmount();
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('abc');
        vi.useRealTimers();
    });

    it('does not commit again on unmount after the timer already did', () => {
        vi.useFakeTimers();
        const onCommit = vi.fn();
        const view = render(
            <DebouncedInput aria-label="n" value="" onCommit={onCommit} />
        );
        fireEvent.change(screen.getByLabelText('n'), {
            target: { value: 'x' },
        });
        vi.advanceTimersByTime(400);
        view.unmount();
        expect(onCommit).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('a required box that is blurred empty shows the saved name again', () => {
        const onCommit = vi.fn();
        render(
            <DebouncedInput
                aria-label="n"
                required
                value="users"
                onCommit={onCommit}
            />
        );
        const box = screen.getByLabelText('n') as HTMLInputElement;
        fireEvent.change(box, { target: { value: '' } });
        fireEvent.blur(box);
        expect(onCommit).not.toHaveBeenCalled();
        expect(box.value).toBe('users');
    });
});
