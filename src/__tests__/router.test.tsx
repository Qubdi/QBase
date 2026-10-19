import { describe, expect, it } from 'vitest';
import type { RouteObject } from 'react-router-dom';
import { buildRoutes } from '../router';

const paths = (routes: RouteObject[]) => routes.map((r) => r.path);

const LOCAL_ONLY = [
    'examples',
    'templates',
    'templates/featured',
    'templates/tags/:tag',
    'templates/:templateSlug',
    'templates/clone/:templateSlug',
];

describe('routes', () => {
    it('offers the example and template pages in the local editor', () => {
        const local = paths(buildRoutes(false));
        for (const path of LOCAL_ONLY) expect(local, path).toContain(path);
        expect(local).toContain('');
        expect(local).toContain('diagrams/:diagramId');
    });

    it('leaves them out when there is a server, where nothing exists outside a project', () => {
        const server = paths(buildRoutes(true));
        for (const path of LOCAL_ONLY) expect(server, path).not.toContain(path);
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
});
