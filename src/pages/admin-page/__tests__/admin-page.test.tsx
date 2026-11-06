import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import {
    createMemoryRouter,
    matchRoutes,
    RouterProvider,
    type RouteObject,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteUser } from '@/lib/qubdi/api';
import { adminRoute } from '../admin-route';
import {
    ADMIN_SECTIONS,
    DEFAULT_ADMIN_SECTION,
    sectionForPath,
} from '../admin-sections';

const state: {
    enabled: boolean;
    user: RemoteUser | null | undefined;
} = { enabled: true, user: undefined };

vi.mock('@/hooks/use-qubdi', () => ({ useQubdi: () => state }));
vi.mock('@/components/logo/logo', () => ({ Logo: () => <span>logo</span> }));
// the panels talk to the server; these tests are about the frame around them
vi.mock('../projects-panel', () => ({
    ProjectsPanel: () => <div>projects panel</div>,
}));
vi.mock('../activity-panel', () => ({
    ActivityPanel: () => <div>activity panel</div>,
}));
vi.mock('../diagrams-panel', () => ({
    DiagramsPanel: () => <div>diagrams panel</div>,
}));
vi.mock('../overview-panel', () => ({
    OverviewPanel: () => <div>overview panel</div>,
}));
vi.mock('../users-panel', () => ({
    UsersPanel: ({ currentUserId }: { currentUserId: string }) => (
        <div>users panel for {currentUserId}</div>
    ),
}));

const admin: RemoteUser = {
    id: 'me',
    email: 'me@corp.io',
    isAdmin: true,
    mustChangePassword: false,
};
const member: RemoteUser = {
    id: 'u2',
    email: 'ann@corp.io',
    isAdmin: false,
    mustChangePassword: false,
};

const open = (path: string) => {
    const router = createMemoryRouter([adminRoute], {
        initialEntries: [path],
    });
    render(
        <HelmetProvider>
            <RouterProvider router={router} />
        </HelmetProvider>
    );
    return router;
};

// the first test in the file also pays for loading the lazy route's modules,
// which can take longer than a second on a busy machine
const nav = () =>
    screen.findByRole(
        'navigation',
        { name: 'Admin sections' },
        { timeout: 15_000 }
    );

describe('admin panel frame', () => {
    beforeEach(() => {
        state.enabled = true;
        state.user = admin;
    });

    it('lists every section as a link, in order', async () => {
        open('/admin/projects');
        const links = within(await nav()).getAllByRole('link');
        expect(links.map((l) => l.textContent)).toEqual([
            'Overview',
            'Projects',
            'Users',
            'Diagrams',
            'Activity',
        ]);
        expect(links.map((l) => l.getAttribute('href'))).toEqual(
            ADMIN_SECTIONS.map((s) => `/admin/${s.id}`)
        );
    });

    it('sends /admin to the default section', async () => {
        const router = open('/admin');
        expect(
            await screen.findByRole('heading', { name: 'Overview' })
        ).toBeTruthy();
        expect(screen.getByText('overview panel')).toBeTruthy();
        expect(router.state.location.pathname).toBe('/admin/overview');
    });

    it('marks the current section and moves when another is chosen', async () => {
        const router = open('/admin/projects');
        const sections = within(await nav());
        const current = (name: string) =>
            sections.getByRole('link', { name }).getAttribute('aria-current');
        expect(current('Projects')).toBe('page');
        expect(current('Users')).toBeNull();

        await userEvent.click(sections.getByRole('link', { name: 'Users' }));

        expect(
            await screen.findByRole('heading', { name: 'Users' })
        ).toBeTruthy();
        expect(screen.getByText('users panel for me')).toBeTruthy();
        expect(screen.queryByText('projects panel')).toBeNull();
        expect(current('Users')).toBe('page');
        expect(current('Projects')).toBeNull();
        expect(router.state.location.pathname).toBe('/admin/users');
    });

    it('brings the current section into view, so a phone never hides it', async () => {
        const scrolled: (string | null)[] = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (this: Element) {
            scrolled.push(this.textContent);
        };
        try {
            open('/admin/activity');
            await nav();
            expect(scrolled).toEqual(['Activity']);

            await userEvent.click(screen.getByRole('link', { name: 'Users' }));
            await screen.findByRole('heading', { name: 'Users' });
            expect(scrolled).toEqual(['Activity', 'Users']);
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });

    // every section has a page of its own, and shows only that one
    const PAGES = {
        overview: 'overview panel',
        projects: 'projects panel',
        users: 'users panel for me',
        diagrams: 'diagrams panel',
        activity: 'activity panel',
    } as const;

    it.each(ADMIN_SECTIONS.map((s) => [s.id, s.label] as const))(
        'shows the %s page in its section',
        async (id, label) => {
            open(`/admin/${id}`);
            expect(
                await screen.findByRole('heading', { name: label })
            ).toBeTruthy();
            expect(screen.getByText(PAGES[id])).toBeTruthy();
            for (const [other, text] of Object.entries(PAGES)) {
                if (other !== id) expect(screen.queryByText(text)).toBeNull();
            }
        }
    );

    it('shows the missing-page message, without the sections, to a member', async () => {
        state.user = member;
        open('/admin/users');
        expect(await screen.findByText('404')).toBeTruthy();
        expect(
            screen.queryByRole('navigation', { name: 'Admin sections' })
        ).toBeNull();
        expect(screen.queryByText(/users panel/)).toBeNull();
    });

    it('shows the missing-page message when the app has no server', async () => {
        state.enabled = false;
        state.user = null;
        open('/admin/projects');
        expect(await screen.findByText('404')).toBeTruthy();
    });

    it('waits while the first sign-in check is running', async () => {
        state.user = undefined;
        open('/admin/projects');
        expect(await screen.findByText('logo')).toBeTruthy();
        expect(screen.queryByText('404')).toBeNull();
        expect(
            screen.queryByRole('navigation', { name: 'Admin sections' })
        ).toBeNull();
    });
});

describe('admin sections', () => {
    it('lands on the overview, which is one of the sections', () => {
        expect(DEFAULT_ADMIN_SECTION).toBe('overview');
        expect(ADMIN_SECTIONS.map((s) => s.id)).toContain(
            DEFAULT_ADMIN_SECTION
        );
    });

    it('finds the section a path belongs to', () => {
        expect(sectionForPath('/admin/users')?.id).toBe('users');
        expect(sectionForPath('/admin/users/')?.id).toBe('users');
        expect(sectionForPath('/admin')).toBeUndefined();
        expect(sectionForPath('/admin/usersx')).toBeUndefined();
        expect(sectionForPath('/projects')).toBeUndefined();
    });
});

describe('admin routes next to the project workspace routes', () => {
    // the editor serves /<project>/diagrams; "admin" is a reserved project name
    // but the router does not know that, so the admin paths must win by shape
    const workspace: RouteObject = { path: ':projectSlug/diagrams' };
    const workspaceDiagram: RouteObject = {
        path: ':projectSlug/diagrams/:remoteDiagramId',
    };

    const leaf = (routes: RouteObject[], path: string) =>
        matchRoutes(routes, path)?.at(-1)?.route;

    it.each([
        [adminRoute, workspace, workspaceDiagram],
        [workspace, workspaceDiagram, adminRoute],
    ])(
        '/admin/diagrams is the admin section whatever the order',
        (...routes) => {
            const match = leaf(routes, '/admin/diagrams');
            expect(match?.path).toBe('diagrams');
            expect(matchRoutes(routes, '/admin/diagrams')?.[0].route.path).toBe(
                'admin'
            );
        }
    );

    it('still serves a real project called diagrams-something', () => {
        const routes = [adminRoute, workspace, workspaceDiagram];
        expect(leaf(routes, '/Qubdi/diagrams')).toBe(workspace);
        expect(leaf(routes, '/Qubdi/diagrams/abc')).toBe(workspaceDiagram);
    });
});
