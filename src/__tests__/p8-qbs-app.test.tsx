import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { __h: unknown }).__h = (
    name: string,
    children: unknown
) => <div data-marker={name}>{children as React.ReactNode}</div>;

const { marker } = vi.hoisted(() => ({
    marker: (name: string) => {
        const Marker = ({ children }: { children?: unknown }) =>
            (
                globalThis as unknown as {
                    __h: (n: string, c: unknown) => unknown;
                }
            ).__h(name, children);
        return Marker;
    },
}));

vi.mock('@/context/qubdi-context/qubdi-provider', () => ({
    QubdiProvider: marker('qbase-session'),
}));
vi.mock('@/components/qubdi/forced-password-change', () => ({
    ForcedPasswordChange: () => <div data-marker="forced-password" />,
}));
vi.mock('@/platform/toast/toaster', () => ({
    Toaster: () => <div data-marker="toaster" />,
}));
vi.mock('react-router-dom', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    RouterProvider: () => <div data-marker="router" />,
}));
vi.mock('@/helmet/helmet-data', () => ({ HelmetData: () => null }));
vi.mock('@/platform/router/router', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    createAppRouter: () => ({}),
}));

import { App } from '../app';
import { adminRoute } from '@/pages/admin-page/admin-route';
import { buildRoutes } from '@/platform/router/router';

describe('QBS-023 App composition', () => {
    it('the QBase session wraps the router, the password dialog and the one toaster', () => {
        const { container } = render(<App />);
        const session = container.querySelector(
            '[data-marker="qbase-session"]'
        )!;
        expect(session).toBeTruthy();
        for (const name of ['forced-password', 'router', 'toaster'])
            expect(
                session.querySelectorAll(`[data-marker="${name}"]`),
                name
            ).toHaveLength(1);
        expect(
            container.querySelectorAll('[data-marker="toaster"]')
        ).toHaveLength(1);
    });

    it('the admin route is part of the route table, with or without a backend', () => {
        for (const enabled of [false, true])
            expect(buildRoutes(enabled)).toContain(adminRoute);
    });
});
