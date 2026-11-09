import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from '../not-found-page';
import { RouteFallback } from '../route-fallback';

describe('NotFoundPage', () => {
    it('says the page is missing under one level-one heading', () => {
        render(<NotFoundPage />);
        expect(screen.getByText('404')).toBeTruthy();
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: "Something's missing.",
            })
        ).toBeTruthy();
        expect(screen.getByText(/we can't find that page/)).toBeTruthy();
    });
});

describe('RouteFallback', () => {
    it('shows a spinner while the first page is fetched, and no text', () => {
        const { container } = render(<RouteFallback />);
        expect(container.firstElementChild?.className).toContain(
            'min-h-screen'
        );
        expect(container.textContent).toBe('');
    });
});
