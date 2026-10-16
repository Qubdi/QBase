import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    type AdminProject,
    type AdminUser,
    type ProjectMember,
} from '@/lib/qubdi/api';
import { ProjectsPanel } from '../projects-panel';

const toast = vi.fn();
vi.mock('@/components/toast/use-toast', () => ({
    useToast: () => ({ toast }),
}));

const calls = {
    list: vi.fn(),
    members: vi.fn(),
    users: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setMember: vi.fn(),
    removeMember: vi.fn(),
};
vi.mock('@/lib/qubdi/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    api: {
        adminListProjects: (...a: unknown[]) => calls.list(...a),
        adminListProjectMembers: (...a: unknown[]) => calls.members(...a),
        adminListUsers: (...a: unknown[]) => calls.users(...a),
        adminCreateProject: (...a: unknown[]) => calls.create(...a),
        adminUpdateProject: (...a: unknown[]) => calls.update(...a),
        adminDeleteProject: (...a: unknown[]) => calls.remove(...a),
        adminSetProjectMember: (...a: unknown[]) => calls.setMember(...a),
        adminRemoveProjectMember: (...a: unknown[]) => calls.removeMember(...a),
    },
}));

// Radix Select expects a few pointer and scroll APIs that happy-dom lacks
beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
});

const project = (
    over: Partial<AdminProject> & Pick<AdminProject, 'id' | 'name'>
) =>
    ({
        slug: over.name.replace(/\s+/g, '-'),
        description: '',
        createdAt: '2025-01-01T00:00:00.000Z',
        members: 0,
        diagrams: 0,
        ...over,
    }) satisfies AdminProject;

const user = (id: string, email: string): AdminUser => ({
    id,
    email,
    isAdmin: false,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    projects: 0,
});

let projects: AdminProject[];
let membersOf: Record<string, ProjectMember[]>;

const billing = () =>
    project({
        id: 'p1',
        name: 'Billing',
        description: 'Invoices and payments',
        members: 2,
        diagrams: 3,
    });
const scratch = () => project({ id: 'p2', name: 'Scratch' });

const page = <T,>(items: T[]) => ({
    items,
    total: items.length,
    page: 1,
    limit: 20,
});

const renderPanel = () =>
    render(
        <MemoryRouter>
            <ProjectsPanel />
        </MemoryRouter>
    );

const header = () => screen.getByRole('region', { name: /^Project / });
const tab = (name: string) => screen.getByRole('tab', { name });
const toastTitles = () => toast.mock.calls.map(([t]) => t.title);

describe('admin ProjectsPanel', () => {
    beforeEach(() => {
        toast.mockReset();
        Object.values(calls).forEach((f) => f.mockReset());
        projects = [billing(), scratch()];
        membersOf = {
            p1: [
                { userId: 'u2', email: 'ann@corp.io', role: 'viewer' },
                { userId: 'u3', email: 'bob@corp.io', role: 'editor' },
            ],
            p2: [],
        };
        calls.list.mockImplementation(async () => page(projects));
        calls.members.mockImplementation(
            async (id: string) => membersOf[id] ?? []
        );
        calls.users.mockImplementation(async () =>
            page([
                user('u2', 'ann@corp.io'),
                user('u9', 'dave@corp.io'),
                { ...user('u1', 'root@corp.io'), isAdmin: true },
            ])
        );
        calls.setMember.mockResolvedValue({});
        calls.removeMember.mockResolvedValue(undefined);
    });

    describe('the open project', () => {
        it('is shown at the top: name, description, address, size and a way to open it', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            const top = within(header());
            expect(top.getByText('Invoices and payments')).toBeTruthy();
            expect(top.getByText('/Billing/diagrams')).toBeTruthy();
            expect(top.getByText(/3 diagrams/)).toBeTruthy();
            expect(
                top
                    .getByRole('link', { name: 'Open workspace' })
                    .getAttribute('href')
            ).toBe('/Billing/diagrams');
        });

        it('says when it has no description', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.click(screen.getByText('Scratch').closest('button')!);
            await screen.findByRole('heading', { name: 'Scratch' });
            expect(within(header()).getByText('No description')).toBeTruthy();
        });

        it('lists the description of each project, and marks the open one', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            const items = within(
                screen.getByRole('list', { name: 'Projects' })
            );
            expect(items.getByText('Invoices and payments')).toBeTruthy();
            expect(
                items
                    .getByText('Billing')
                    .closest('button')!
                    .getAttribute('aria-current')
            ).toBe('true');
            expect(
                items
                    .getByText('Scratch')
                    .closest('button')!
                    .getAttribute('aria-current')
            ).toBeNull();
        });

        it('opens on the members; the settings are one tab away', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            expect(tab('Members').getAttribute('aria-selected')).toBe('true');
            const assigned = within(
                screen.getByRole('list', { name: 'Assigned users' })
            );
            expect(assigned.getByText('ann@corp.io')).toBeTruthy();
            expect(screen.queryByLabelText('Project name')).toBeNull();

            await userEvent.click(tab('Settings'));
            expect(
                (screen.getByLabelText('Project name') as HTMLInputElement)
                    .value
            ).toBe('Billing');
            expect(
                screen.queryByRole('list', { name: 'Assigned users' })
            ).toBeNull();
        });
    });

    describe('members', () => {
        it('adds a person with the chosen permission and says so', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            // ann is already in the project and root is an admin (full access
            // anyway), so only dave is offered
            const picker = await screen.findByRole('list', {
                name: 'Matching users',
            });
            expect(within(picker).queryByText('ann@corp.io')).toBeNull();
            expect(within(picker).queryByText('root@corp.io')).toBeNull();
            fireEvent.click(within(picker).getByText('dave@corp.io'));
            await userEvent.click(
                screen.getByRole('button', { name: 'Assign' })
            );

            await waitFor(() =>
                expect(calls.setMember).toHaveBeenCalledWith(
                    'p1',
                    'u9',
                    'viewer'
                )
            );
            await waitFor(() =>
                expect(toastTitles()).toContain('Added dave@corp.io')
            );
            expect(toast.mock.calls[0][0].description).toBe(
                'As a viewer in Billing.'
            );
        });

        it('changes a permission and says so', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.keyDown(
                screen.getByRole('combobox', {
                    name: 'Permission for ann@corp.io',
                }),
                { key: ' ' }
            );
            fireEvent.click(
                await screen.findByRole('option', { name: 'Editor' })
            );

            await waitFor(() =>
                expect(calls.setMember).toHaveBeenCalledWith(
                    'p1',
                    'u2',
                    'editor'
                )
            );
            await waitFor(() =>
                expect(toastTitles()).toContain('ann@corp.io is now an editor')
            );
        });

        it('removes a person at once, and offers to put them back with the same permission', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.click(
                screen.getByRole('button', { name: 'Remove bob@corp.io' })
            );

            await waitFor(() =>
                expect(calls.removeMember).toHaveBeenCalledWith('p1', 'u3')
            );
            await waitFor(() => expect(toast).toHaveBeenCalled());
            const shown = toast.mock.calls[0][0];
            expect(shown.title).toBe('Removed bob@corp.io');
            expect(shown.description).toBe(
                'They no longer have access to Billing.'
            );

            // pressing Undo in the toast gives bob his editor access back
            shown.action.props.onClick();
            await waitFor(() =>
                expect(calls.setMember).toHaveBeenCalledWith(
                    'p1',
                    'u3',
                    'editor'
                )
            );
        });

        it('shows what went wrong in the page, and drops it when another project is opened', async () => {
            calls.removeMember.mockRejectedValue(
                new ApiError(404, 'not_found')
            );
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.click(
                screen.getByRole('button', { name: 'Remove ann@corp.io' })
            );
            expect((await screen.findByRole('alert')).textContent).toBe(
                'Not found.'
            );
            // nothing was removed, so no "removed" message
            expect(toast).not.toHaveBeenCalled();

            fireEvent.click(screen.getByText('Scratch').closest('button')!);
            await screen.findByRole('heading', { name: 'Scratch' });
            expect(screen.queryByRole('alert')).toBeNull();
        });

        it('tells an empty project how to get its first person', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.click(screen.getByText('Scratch').closest('button')!);
            expect(
                await screen.findByText(/Nobody is assigned yet\./)
            ).toBeTruthy();
        });
    });

    describe('settings', () => {
        const openSettings = async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            await userEvent.click(tab('Settings'));
        };
        const save = () =>
            screen.getByRole('button', {
                name: 'Save changes',
            }) as HTMLButtonElement;

        it('saves a change, says so, and can discard one', async () => {
            calls.update.mockResolvedValue({ ...billing(), name: 'Billing 2' });
            await openSettings();
            expect(save().disabled).toBe(true);
            expect(
                screen.queryByRole('button', { name: 'Discard' })
            ).toBeNull();

            const name = screen.getByLabelText(
                'Project name'
            ) as HTMLInputElement;
            await userEvent.clear(name);
            await userEvent.type(name, 'Billing 2');
            expect(save().disabled).toBe(false);

            await userEvent.click(
                screen.getByRole('button', { name: 'Discard' })
            );
            expect(name.value).toBe('Billing');
            expect(save().disabled).toBe(true);

            await userEvent.clear(name);
            await userEvent.type(name, 'Billing 2');
            await userEvent.click(save());
            await waitFor(() =>
                expect(calls.update).toHaveBeenCalledWith('p1', {
                    name: 'Billing 2',
                    description: 'Invoices and payments',
                })
            );
            await waitFor(() =>
                expect(toastTitles()).toContain('Changes saved')
            );
        });

        it('does not let a project with diagrams be deleted, and says why', async () => {
            await openSettings();
            const del = screen.getByRole('region', { name: 'Delete project' });
            expect(
                within(del).getByText(/still holds 3 diagrams/)
            ).toBeTruthy();
            expect(
                (
                    within(del).getByRole('button', {
                        name: 'Delete project',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(true);
        });

        it('asks first, then deletes an empty project and moves on without an error', async () => {
            calls.remove.mockImplementation(async (id: string) => {
                projects = projects.filter((p) => p.id !== id);
            });
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.click(screen.getByText('Scratch').closest('button')!);
            await screen.findByRole('heading', { name: 'Scratch' });
            await userEvent.click(tab('Settings'));

            const del = screen.getByRole('region', { name: 'Delete project' });
            expect(within(del).getByText(/Removes the project/)).toBeTruthy();
            await userEvent.click(
                within(del).getByRole('button', { name: 'Delete project' })
            );
            expect(calls.remove).not.toHaveBeenCalled();

            const confirm = await screen.findByRole('alertdialog');
            await userEvent.click(
                within(confirm).getByRole('button', { name: 'Delete project' })
            );

            await waitFor(() =>
                expect(calls.remove).toHaveBeenCalledWith('p2')
            );
            await waitFor(() =>
                expect(toastTitles()).toContain('Project deleted')
            );
            // Billing is open again, and the deleted project's members were not asked for
            await screen.findByRole('heading', { name: 'Billing' });
            expect(
                calls.members.mock.calls.filter(([id]) => id === 'p2')
            ).toHaveLength(1);
            expect(screen.queryByRole('alert')).toBeNull();
        });
    });

    describe('creating a project', () => {
        const openDialog = async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            await userEvent.click(
                screen.getByRole('button', { name: 'New project' })
            );
            return within(await screen.findByRole('dialog'));
        };

        it('is a dialog, not a form that sits above the list', async () => {
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            expect(
                screen.queryByRole('form', { name: 'Create project' })
            ).toBeNull();
            await userEvent.click(
                screen.getByRole('button', { name: 'New project' })
            );
            expect(
                await screen.findByRole('form', { name: 'Create project' })
            ).toBeTruthy();
        });

        it('creates the project, opens it on its members and says so', async () => {
            calls.create.mockImplementation(async (body: { name: string }) => {
                const p = project({ id: 'p3', name: body.name });
                projects = [...projects, p];
                membersOf.p3 = [];
                return p;
            });
            const dialog = await openDialog();
            await userEvent.type(
                dialog.getByLabelText('Project name'),
                '  Reports '
            );
            await userEvent.type(
                dialog.getByLabelText('Description (optional)'),
                'Monthly'
            );
            await userEvent.click(
                dialog.getByRole('button', { name: 'Create project' })
            );

            await waitFor(() =>
                expect(calls.create).toHaveBeenCalledWith({
                    name: 'Reports',
                    description: 'Monthly',
                })
            );
            await screen.findByRole('heading', { name: 'Reports' });
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(tab('Members').getAttribute('aria-selected')).toBe('true');
            expect(toastTitles()).toContain('Project created');
        });

        it('stays open and says why when the name is taken', async () => {
            calls.create.mockRejectedValue(new ApiError(409, 'name_taken'));
            const dialog = await openDialog();
            await userEvent.type(
                dialog.getByLabelText('Project name'),
                'Billing'
            );
            await userEvent.click(
                dialog.getByRole('button', { name: 'Create project' })
            );

            expect((await dialog.findByRole('alert')).textContent).toBe(
                'That name is already in use.'
            );
            expect(screen.getByRole('dialog')).toBeTruthy();
            expect(toast).not.toHaveBeenCalled();
        });

        it('cannot be submitted without a name, and opens blank each time', async () => {
            const dialog = await openDialog();
            expect(
                (
                    dialog.getByRole('button', {
                        name: 'Create project',
                    }) as HTMLButtonElement
                ).disabled
            ).toBe(true);
            await userEvent.type(
                dialog.getByLabelText('Project name'),
                'Draft'
            );
            await userEvent.click(
                dialog.getByRole('button', { name: 'Cancel' })
            );
            await waitFor(() =>
                expect(screen.queryByRole('dialog')).toBeNull()
            );

            await userEvent.click(
                screen.getByRole('button', { name: 'New project' })
            );
            const again = within(await screen.findByRole('dialog'));
            expect(
                (again.getByLabelText('Project name') as HTMLInputElement).value
            ).toBe('');
        });
    });

    describe('with no projects at all', () => {
        it('invites the first one, with a button right there', async () => {
            projects = [];
            renderPanel();
            expect(
                await screen.findByRole('heading', { name: 'No projects yet' })
            ).toBeTruthy();
            // one button above the list and one in the invitation
            const buttons = screen.getAllByRole('button', {
                name: 'New project',
            });
            expect(buttons).toHaveLength(2);
            await userEvent.click(buttons[1]);
            expect(await screen.findByRole('dialog')).toBeTruthy();
        });

        it('does not claim there are none when a search finds nothing', async () => {
            calls.list.mockImplementation(async ({ q }: { q?: string }) =>
                page(q ? [] : projects)
            );
            renderPanel();
            await screen.findByRole('heading', { name: 'Billing' });
            fireEvent.change(screen.getByLabelText('Search projects'), {
                target: { value: 'zzz' },
            });
            await screen.findByText(
                'No projects match "zzz".',
                {},
                { timeout: 2000 }
            );
            expect(
                screen.queryByRole('heading', { name: 'No projects yet' })
            ).toBeNull();
        });
    });
});
