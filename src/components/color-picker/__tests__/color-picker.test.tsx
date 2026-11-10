import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colorOptions } from '@/lib/colors';
import { CUSTOM_COLORS_KEY } from '@/lib/custom-colors';
import { ColorPicker } from '../color-picker';

const open = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Change color' }));

const hexField = () => screen.getByLabelText('Hex color') as HTMLInputElement;
const useButton = () =>
    screen.getByRole('button', { name: 'Use' }) as HTMLButtonElement;

const setup = (
    color = '#8eb7ff',
    props: Partial<React.ComponentProps<typeof ColorPicker>> = {}
) => {
    const onChange = vi.fn();
    render(<ColorPicker color={color} onChange={onChange} {...props} />);
    return { onChange };
};

const saved = () => JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY) ?? '[]');

describe('ColorPicker', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('shows the current color on the trigger', () => {
        setup('#ff6363');
        expect(
            screen.getByRole('button', { name: 'Change color' }).style
                .backgroundColor
        ).toMatch(/^(#ff6363|rgb\(255, 99, 99\))$/);
    });

    describe('built-in palette', () => {
        it('lists every built-in color', () => {
            setup();
            open();
            for (const c of colorOptions) {
                expect(
                    screen.getByRole('button', { name: `Use ${c}` })
                ).toBeTruthy();
            }
        });

        it('applies a built-in color without saving it as a custom one', () => {
            const { onChange } = setup();
            open();
            fireEvent.click(
                screen.getByRole('button', { name: `Use ${colorOptions[0]}` })
            );
            expect(onChange).toHaveBeenCalledWith(colorOptions[0]);
            expect(saved()).toEqual([]);
        });

        it('marks the current color', () => {
            setup(colorOptions[2].toUpperCase());
            open();
            expect(
                screen
                    .getByRole('button', { name: `Use ${colorOptions[2]}` })
                    .getAttribute('aria-pressed')
            ).toBe('true');
            expect(
                screen
                    .getByRole('button', { name: `Use ${colorOptions[3]}` })
                    .getAttribute('aria-pressed')
            ).toBe('false');
        });
    });

    describe('custom colors', () => {
        it('applies a typed hex color and remembers it', () => {
            const { onChange } = setup();
            open();
            fireEvent.change(hexField(), { target: { value: '#1a2b3c' } });
            fireEvent.click(useButton());
            expect(onChange).toHaveBeenCalledWith('#1a2b3c');
            expect(saved()).toEqual(['#1a2b3c']);
        });

        it('accepts a color without the hash, in capitals, or in short form', () => {
            const { onChange } = setup();
            open();
            fireEvent.change(hexField(), { target: { value: 'ABCDEF' } });
            fireEvent.click(useButton());
            expect(onChange).toHaveBeenLastCalledWith('#abcdef');
            fireEvent.change(hexField(), { target: { value: '#f80' } });
            fireEvent.click(useButton());
            expect(onChange).toHaveBeenLastCalledWith('#ff8800');
        });

        it('applies on Enter', () => {
            const { onChange } = setup();
            open();
            fireEvent.change(hexField(), { target: { value: '#123456' } });
            fireEvent.submit(hexField().closest('form')!);
            expect(onChange).toHaveBeenCalledWith('#123456');
        });

        it('lets the native color input choose, then applies it with Use', () => {
            const { onChange } = setup();
            open();
            fireEvent.change(screen.getByLabelText('Pick a custom color'), {
                target: { value: '#00ff7f' },
            });
            // dragging in the native picker must not change the diagram yet
            expect(onChange).not.toHaveBeenCalled();
            expect(hexField().value).toBe('#00ff7f');
            fireEvent.click(useButton());
            expect(onChange).toHaveBeenCalledWith('#00ff7f');
        });

        it('keeps Use off and explains when the text is not a color', () => {
            const { onChange } = setup();
            open();
            expect(useButton().disabled).toBe(true);
            fireEvent.change(hexField(), { target: { value: '#12' } });
            expect(useButton().disabled).toBe(true);
            expect(screen.getByRole('alert').textContent).toMatch(/#8eb7ff/);
            expect(hexField().getAttribute('aria-invalid')).toBe('true');
            fireEvent.submit(hexField().closest('form')!);
            expect(onChange).not.toHaveBeenCalled();
            expect(saved()).toEqual([]);
        });

        it('clears the box after a color is used', () => {
            setup();
            open();
            fireEvent.change(hexField(), { target: { value: '#123456' } });
            fireEvent.click(useButton());
            expect(hexField().value).toBe('');
        });
    });

    describe('your colors', () => {
        it('lists saved colors and applies one on click', () => {
            localStorage.setItem(CUSTOM_COLORS_KEY, '["#112233","#445566"]');
            const { onChange } = setup();
            open();
            const group = screen.getByRole('group', { name: 'Your colors' });
            expect(
                within(group).getAllByRole('button', { name: /^Use / })
            ).toHaveLength(2);
            fireEvent.click(
                within(group).getByRole('button', { name: 'Use #445566' })
            );
            expect(onChange).toHaveBeenCalledWith('#445566');
        });

        it('shows a color as soon as it is created', () => {
            setup();
            open();
            expect(
                screen.queryByRole('group', { name: 'Your colors' })
            ).toBeNull();
            fireEvent.change(hexField(), { target: { value: '#778899' } });
            fireEvent.click(useButton());
            const group = screen.getByRole('group', { name: 'Your colors' });
            expect(
                within(group).getByRole('button', { name: 'Use #778899' })
            ).toBeTruthy();
        });

        it('removes a saved color without applying anything', () => {
            localStorage.setItem(CUSTOM_COLORS_KEY, '["#112233","#445566"]');
            const { onChange } = setup();
            open();
            fireEvent.click(
                screen.getByRole('button', { name: 'Remove #112233' })
            );
            expect(onChange).not.toHaveBeenCalled();
            expect(saved()).toEqual(['#445566']);
            expect(
                screen.queryByRole('button', { name: 'Use #112233' })
            ).toBeNull();
        });

        it('hides the section when none are saved', () => {
            setup();
            open();
            expect(screen.queryByText('Your colors')).toBeNull();
        });

        it('marks a saved color as current', () => {
            localStorage.setItem(CUSTOM_COLORS_KEY, '["#112233"]');
            setup('#112233');
            open();
            expect(
                screen
                    .getByRole('button', { name: 'Use #112233' })
                    .getAttribute('aria-pressed')
            ).toBe('true');
        });
    });

    it('does not open when disabled', () => {
        setup('#8eb7ff', { disabled: true });
        open();
        expect(screen.queryByLabelText('Hex color')).toBeNull();
    });

    it('passes mouse events through so the canvas does not drag the table', () => {
        const down = vi.fn();
        setup('#8eb7ff', { popoverOnMouseDown: down });
        open();
        fireEvent.mouseDown(hexField());
        expect(down).toHaveBeenCalled();
    });
});
