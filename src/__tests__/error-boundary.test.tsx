import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '@/platform/router/router';
import { AppErrorBoundary, RouteError } from '@/platform/router/problem-page';

const Boom: React.FC = () => {
    throw new Error('render failed');
};

describe('a failure shows a message, not a blank screen', () => {
    beforeEach(
        () => void vi.spyOn(console, 'error').mockImplementation(() => {})
    );
    afterEach(() => vi.restoreAllMocks());

    it('every route has an error element', () => {
        for (const enabled of [false, true])
            for (const route of buildRoutes(enabled))
                expect(route.errorElement, String(route.path)).toBeTruthy();
    });

    it('a page that throws while drawing shows the message and a reload button', async () => {
        const router = createMemoryRouter([
            { path: '/', element: <Boom />, errorElement: <RouteError /> },
        ]);
        render(<RouterProvider router={router} />);
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByText('Something went wrong.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    });

    it('a page whose code fails to load shows it too', async () => {
        const router = createMemoryRouter([
            {
                path: '/',
                errorElement: <RouteError />,
                async lazy() {
                    throw new Error(
                        'Failed to fetch dynamically imported module'
                    );
                },
            },
        ]);
        render(<RouterProvider router={router} />);
        expect(await screen.findByText('Something went wrong.')).toBeTruthy();
    });

    it('the app-wide boundary catches what the routes do not', () => {
        render(
            <AppErrorBoundary>
                <Boom />
            </AppErrorBoundary>
        );
        expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    });
});
