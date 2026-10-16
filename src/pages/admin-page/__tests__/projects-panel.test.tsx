import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminProject } from '@/lib/qubdi/api';
import { ProjectsPanel } from '../projects-panel';

const project = (n: number): AdminProject => ({
    id: `p${n}`,
    name: `Project ${n}`,
    slug: `Project-${n}`,
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    members: n % 3,
    diagrams: n,
});

// twelve projects, served the way the real server pages them
const all = Array.from({ length: 12 }, (_, i) => project(i + 1));

const adminListProjects = vi.fn();
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListProjects: (...a: unknown[]) => adminListProjects(...a),
        adminListProjectMembers: async () => [],
        adminListUsers: async () => ({
            items: [],
            total: 0,
            page: 1,
            limit: 20,
        }),
        adminCreateProject: vi.fn(),
        adminUpdateProject: vi.fn(),
        adminDeleteProject: vi.fn(),
        adminSetProjectMember: vi.fn(),
        adminRemoveProjectMember: vi.fn(),
    },
}));

const renderPanel = () =>
    render(
        <MemoryRouter>
            <ProjectsPanel />
        </MemoryRouter>
    );

const list = () => screen.getByRole('list', { name: 'Projects' });
const names = () =>
    within(list())
        .getAllByRole('listitem')
        .map((li) => li.querySelector('span.font-medium')?.textContent);

describe('admin ProjectsPanel paging', () => {
    beforeEach(() => {
        adminListProjects.mockReset();
        adminListProjects.mockImplementation(
            async (p: { page?: number; limit?: number; q?: string }) => {
                const matching = p.q
                    ? all.filter((x) =>
                          x.name.toLowerCase().includes(p.q!.toLowerCase())
                      )
                    : all;
                const page = p.page ?? 1;
                const limit = p.limit ?? 20;
                return {
                    items: matching.slice((page - 1) * limit, page * limit),
                    total: matching.length,
                    page,
                    limit,
                };
            }
        );
    });

    it('asks for five projects at a time', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        expect(adminListProjects).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1, limit: 5 })
        );
    });

    it('shows no more than five projects on a page', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        expect(names()).toEqual([
            'Project 1',
            'Project 2',
            'Project 3',
            'Project 4',
            'Project 5',
        ]);
        expect(screen.getByText('1–5 of 12 projects')).toBeTruthy();
        expect(screen.getByText('1 / 3')).toBeTruthy();
    });

    it('moves to the next page of five, then to the short last page', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        fireEvent.click(screen.getByLabelText('Next page'));
        expect(await screen.findByText('6–10 of 12 projects')).toBeTruthy();
        expect(names()).toEqual([
            'Project 6',
            'Project 7',
            'Project 8',
            'Project 9',
            'Project 10',
        ]);
        fireEvent.click(screen.getByLabelText('Next page'));
        expect(await screen.findByText('11–12 of 12 projects')).toBeTruthy();
        expect(names()).toEqual(['Project 11', 'Project 12']);
        expect(
            (screen.getByLabelText('Next page') as HTMLButtonElement).disabled
        ).toBe(true);
        expect(adminListProjects).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 3, limit: 5 })
        );
    });

    it('can go back to the previous page', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        fireEvent.click(screen.getByLabelText('Next page'));
        await within(list()).findByText('Project 6');
        fireEvent.click(screen.getByLabelText('Previous page'));
        expect(await screen.findByText('1–5 of 12 projects')).toBeTruthy();
    });

    it('keeps the chosen project open while another page is shown', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        fireEvent.click(
            within(list()).getByText('Project 2').closest('button')!
        );
        const shown = () =>
            screen
                .getByRole('region', { name: /^Project / })
                .querySelector('h2')?.textContent;
        expect(shown()).toBe('Project 2');
        fireEvent.click(screen.getByLabelText('Next page'));
        await within(list()).findByText('Project 6');
        // Project 2 is no longer in the list, but it is still the one being shown
        expect(shown()).toBe('Project 2');
    });

    it('searches from the first page, still five at a time', async () => {
        renderPanel();
        await within(list()).findByText('Project 1');
        fireEvent.click(screen.getByLabelText('Next page'));
        await within(list()).findByText('Project 6');
        fireEvent.change(screen.getByLabelText('Search projects'), {
            target: { value: 'project 1' },
        });
        // Project 1, 10, 11, 12 match
        await waitFor(
            () => expect(screen.getByText('1–4 of 4 projects')).toBeTruthy(),
            {
                timeout: 2000,
            }
        );
        expect(names()).toEqual([
            'Project 1',
            'Project 10',
            'Project 11',
            'Project 12',
        ]);
        expect(adminListProjects).toHaveBeenLastCalledWith(
            expect.objectContaining({ page: 1, limit: 5, q: 'project 1' })
        );
    });
});
