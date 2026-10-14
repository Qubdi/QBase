import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import type { MyProject, RemoteUser } from '@/lib/qubdi/api';
import { ProjectList } from '../home-page';

const project = (n: number, over: Partial<MyProject> = {}): MyProject => ({
    id: `p${n}`,
    name: `Project ${n}`,
    slug: `Project-${n}`,
    description: '',
    diagramCount: 0,
    role: 'editor',
    ...over,
});

const listProjects = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: { listProjects: (...a: unknown[]) => listProjects(...a) },
}));

const reply = (items: MyProject[], total = items.length, page = 1) => ({
    items,
    total,
    page,
    limit: 9,
});

const renderList = (user: RemoteUser) =>
    render(
        <MemoryRouter>
            <qubdiContext.Provider
                value={{ enabled: true, user } as unknown as QubdiContext}
            >
                <ProjectList />
            </qubdiContext.Provider>
        </MemoryRouter>
    );

const member: RemoteUser = { id: 'u', email: 'm@x.io', isAdmin: false };
const admin: RemoteUser = { id: 'a', email: 'a@x.io', isAdmin: true };

describe('home page project list', () => {
    // a block body: a returned function would be run by vitest as a cleanup hook
    beforeEach(() => {
        listProjects.mockReset();
    });

    it('shows the projects the server returns, with role and diagram count', async () => {
        listProjects.mockResolvedValue(
            reply([
                project(1, {
                    diagramCount: 1,
                    role: 'viewer',
                    description: 'Billing',
                }),
                project(2, { diagramCount: 5 }),
            ])
        );
        renderList(member);
        expect(await screen.findByText('Project 1')).toBeTruthy();
        expect(screen.getByText('Viewer')).toBeTruthy();
        expect(screen.getByText('Editor')).toBeTruthy();
        expect(screen.getByText('1 diagram')).toBeTruthy();
        expect(screen.getByText('5 diagrams')).toBeTruthy();
        expect(screen.getByText('Billing')).toBeTruthy();
    });

    it('links each project to its workspace URL, not to an id', async () => {
        listProjects.mockResolvedValue(reply([project(1, { slug: 'Qubdi' })]));
        renderList(member);
        const link = (await screen.findByText('Project 1')).closest('a');
        expect(link?.getAttribute('href')).toBe('/Qubdi/diagrams');
    });

    it('asks for a page of nine and nothing else on first load', async () => {
        listProjects.mockResolvedValue(reply([project(1)]));
        renderList(member);
        await screen.findByText('Project 1');
        expect(listProjects).toHaveBeenCalledWith({
            page: 1,
            limit: 9,
            q: '',
        });
    });

    it('tells a member with no projects to ask an admin', async () => {
        listProjects.mockResolvedValue(reply([]));
        renderList(member);
        expect(
            await screen.findByText(/not assigned to any project yet/)
        ).toBeTruthy();
        expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('sends an admin with no projects to the admin panel', async () => {
        listProjects.mockResolvedValue(reply([]));
        renderList(admin);
        const link = await screen.findByText('admin panel');
        expect(link.closest('a')?.getAttribute('href')).toBe('/admin');
    });

    it('pages through many projects', async () => {
        const first = Array.from({ length: 9 }, (_, i) => project(i + 1));
        const second = Array.from({ length: 9 }, (_, i) => project(i + 10));
        listProjects.mockImplementation(async (p: { page: number }) =>
            reply(p.page === 1 ? first : second, 20, p.page)
        );
        renderList(member);
        expect(await screen.findByText('1–9 of 20 projects')).toBeTruthy();
        expect(screen.getByText('1 / 3')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Next page'));
        expect(await screen.findByText('10–18 of 20 projects')).toBeTruthy();
        expect(screen.getByText('Project 10')).toBeTruthy();
        expect(screen.queryByText('Project 1')).toBeNull();
        expect(
            (screen.getByLabelText('Previous page') as HTMLButtonElement)
                .disabled
        ).toBe(false);
    });

    it('searches the server and shows what matches', async () => {
        listProjects.mockImplementation(async (p: { q: string }) =>
            p.q === 'two'
                ? reply([project(2, { name: 'Project two' })])
                : reply([project(1), project(2, { name: 'Project two' })])
        );
        renderList(member);
        await screen.findByText('Project 1');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'two' },
        });
        await waitFor(
            () => expect(screen.queryByText('Project 1')).toBeNull(),
            {
                timeout: 2000,
            }
        );
        expect(screen.getByText('Project two')).toBeTruthy();
        expect(listProjects).toHaveBeenLastCalledWith({
            page: 1,
            limit: 9,
            q: 'two',
        });
    });

    it('says so when a search finds nothing, and keeps the search box', async () => {
        listProjects.mockImplementation(async (p: { q: string }) =>
            p.q ? reply([]) : reply([project(1)])
        );
        renderList(member);
        await screen.findByText('Project 1');
        fireEvent.change(screen.getByRole('searchbox'), {
            target: { value: 'zzz' },
        });
        expect(
            await screen.findByText(/No projects match/, undefined, {
                timeout: 2000,
            })
        ).toBeTruthy();
        expect(screen.getByRole('searchbox')).toBeTruthy();
    });

    it('shows an error from the server', async () => {
        listProjects.mockRejectedValue(new Error('boom'));
        renderList(member);
        expect(await screen.findByRole('alert')).toBeTruthy();
    });
});
