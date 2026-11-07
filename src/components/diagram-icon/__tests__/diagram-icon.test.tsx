import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/platform/ui/tooltip';
import { DatabaseType } from '@/qbase/diagram-types';
import { DiagramIcon } from '../diagram-icon';

const show = (onClick?: () => void) =>
    render(
        <TooltipProvider>
            <DiagramIcon
                databaseType={DatabaseType.POSTGRESQL}
                onClick={onClick}
            />
        </TooltipProvider>
    );

describe('DiagramIcon', () => {
    it('is a plain image when nothing happens on click', () => {
        show();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByRole('img')).toBeTruthy();
    });

    it('is a button that works from the keyboard when it has a click handler', () => {
        const onClick = vi.fn();
        show(onClick);
        const button = screen.getByRole('button');
        expect(button.getAttribute('tabindex')).toBe('0');
        fireEvent.click(button);
        fireEvent.keyDown(button, { key: 'Enter' });
        fireEvent.keyDown(button, { key: ' ' });
        fireEvent.keyDown(button, { key: 'a' });
        // the click, and the two keys that act as one
        expect(onClick).toHaveBeenCalledTimes(3);
    });

    it('draws a database drum on the colour of the database, not letters', () => {
        show();
        const src = decodeURIComponent(
            screen.getByRole('img').getAttribute('src') ?? ''
        );
        expect(src).toContain('#336791');
        expect(src).toContain('<ellipse');
        expect(src).not.toContain('<text');
    });
});
