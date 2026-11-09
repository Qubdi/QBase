import React from 'react';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import {
    createMemoryRouter,
    matchRoutes,
    RouterProvider,
    type RouteObject,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/platform/router/router';

/** The route pattern a path is served by (the first matched route that has a path). */
/** The page element a lazy route resolves to. */
const pageOf = async (route: RouteObject): Promise<React.ReactElement> =>
    (
        await (
            route.lazy as unknown as () => Promise<{
                element: React.ReactElement;
            }>
        )()
    ).element;

const served = (backend: boolean, path: string): string | undefined =>
    matchRoutes(buildRoutes(backend), path)?.at(-1)?.route.path;

describe('routes by mode (SHL-009, SHL-010)', () => {
    it('SHL-009: with a server, / is the project picker and the editor lives in a project', () => {
        expect(served(true, '/')).toBe('');
        expect(served(true, '/billing/diagrams')).toBe(':projectSlug/diagrams');
        expect(served(true, '/billing/diagrams/abc')).toBe(
            ':projectSlug/diagrams/:remoteDiagramId'
        );
        // the old bookmark form still works
        expect(served(true, '/diagrams/local-1')).toBe('diagrams/:diagramId');
    });

    it('SHL-009: with a server, / is not the editor (it is the home page)', async () => {
        const root = buildRoutes(true).find((r) => r.path === '')!;
        const home = await pageOf(root);
        // the home route is a different page from the editor route
        const editor = buildRoutes(true).find(
            (r) => r.path === 'diagrams/:diagramId'
        )!;
        const editorElement = await pageOf(editor);
        expect(home.type).not.toBe(editorElement.type);
    });

    it('SHL-010: without a server, / and /diagrams/<id> are the editor and a project path is not found', async () => {
        expect(served(false, '/')).toBe('');
        expect(served(false, '/diagrams/x')).toBe('diagrams/:diagramId');
        expect(served(false, '/billing/diagrams')).toBe('*');
        const routes = buildRoutes(false);
        const a = await pageOf(routes.find((r) => r.path === '')!);
        const b = await pageOf(
            routes.find((r) => r.path === 'diagrams/:diagramId')!
        );
        expect(a.type).toBe(b.type);
    });
});

describe('the 404 page (SHL-013)', () => {
    it.each([false, true])(
        'shows the 404 text and the footer mark for an unknown path (backend %s)',
        async (backend) => {
            const router = createMemoryRouter(buildRoutes(backend), {
                initialEntries: ['/no/such/page/at/all'],
            });
            render(
                <HelmetProvider>
                    <RouterProvider router={router} />
                </HelmetProvider>
            );
            expect(await screen.findByText('404')).toBeTruthy();
            expect(screen.getByText("Something's missing.")).toBeTruthy();
            expect(screen.getByText('Powered by')).toBeTruthy();
            expect(screen.getByLabelText('Qubdi')).toBeTruthy();
        }
    );
});

describe('every page loads lazily (SHL-017)', () => {
    it('no route holds its page as a ready element, only a lazy loader', () => {
        for (const backend of [false, true])
            for (const route of buildRoutes(backend)) {
                expect(route.element, route.path).toBeUndefined();
                expect(typeof route.lazy, route.path).toBe('function');
            }
    });
});
