import React, { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useClampedPlacement } from './use-clamped';

function Card({ at }: { at: { x: number; y: number } }) {
    const ref = useRef<HTMLDivElement>(null);
    const place = useClampedPlacement(ref, at);
    return (
        <div
            ref={ref}
            data-testid="card"
            style={{ position: 'fixed', left: place.left, top: place.top }}
        />
    );
}

describe('review ui 6: floating cards stay inside the window', () => {
    afterEach(() => vi.restoreAllMocks());

    it('moves a 288 px card left when the tap was near the right edge of a 360 px phone', () => {
        vi.stubGlobal('innerWidth', 360);
        vi.stubGlobal('innerHeight', 640);
        vi.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect'
        ).mockReturnValue({
            width: 288,
            height: 200,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 288,
            bottom: 200,
            toJSON: () => ({}),
        });
        render(<Card at={{ x: 250, y: 600 }} />);
        const style = screen.getByTestId('card').style;
        expect(style.left).toBe('64px');
        expect(style.top).toBe('432px');
    });

    it('keeps a card that already fits where it was asked to be', () => {
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        vi.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect'
        ).mockReturnValue({
            width: 100,
            height: 50,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 100,
            bottom: 50,
            toJSON: () => ({}),
        });
        render(<Card at={{ x: 120, y: 90 }} />);
        expect(screen.getByTestId('card').style.left).toBe('120px');
    });
});
