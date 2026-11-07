import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import { buildRoutes } from '../router';

const paths = (routes: RouteObject[]) => routes.map((r) => r.path);

// the example and template pages were dropped by the owner (SHL-018, SHL-091, SHL-092)
const DROPPED = ['examples', 'templates', 'templates/featured'];

describe('routes', () => {
    it('offers the editor and a diagram by id in the local editor, without example or template pages', () => {
        const local = paths(buildRoutes(false));
        for (const path of DROPPED) expect(local, path).not.toContain(path);
        expect(local).toContain('');
        expect(local).toContain('diagrams/:diagramId');
    });

    it('has only project routes when there is a server, where nothing exists outside a project', () => {
        const server = paths(buildRoutes(true));
        for (const path of DROPPED) expect(server, path).not.toContain(path);
        expect(server).toContain(':projectSlug/diagrams/:remoteDiagramId');
        expect(server).toContain('s/:token');
        // everything else still resolves to the not-found page
        expect(server.at(-1)).toBe('*');
    });

    it('keeps the share viewer and the not-found page in both modes', () => {
        for (const enabled of [false, true]) {
            const all = paths(buildRoutes(enabled));
            expect(all).toContain('s/:token');
            expect(all.at(-1)).toBe('*');
        }
    });

    it('gives every route that loads its page a HydrateFallback, so react-router does not warn on start', () => {
        const lacking = (routes: RouteObject[]): (string | undefined)[] =>
            routes.flatMap((r) => [
                ...(r.lazy && !r.HydrateFallback ? [r.path] : []),
                ...lacking(r.children ?? []),
            ]);
        for (const enabled of [false, true])
            expect(lacking(buildRoutes(enabled))).toEqual([]);
    });
});
