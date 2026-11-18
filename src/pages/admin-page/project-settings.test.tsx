import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminProject } from '@/lib/qubdi/api';
import { ProjectSettings } from './project-settings';

const project = (patch: Partial<AdminProject> = {}): AdminProject => ({
    id: 'p1',
    name: 'Shop',
    slug: 'shop',
    description: 'orders',
    createdAt: '2026-01-01T00:00:00Z',
    members: 2,
    diagrams: 0,
    ...patch,
});

const setup = (p = project(), busy = false) => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    render(
        <ProjectSettings
            project={p}
            busy={busy}
            onSave={onSave}
            onDelete={onDelete}
        />
    );
    return { onSave, onDelete };
};

const save = () => screen.getByRole('button', { name: 'Save changes' });

describe('ProjectSettings', () => {
    it('starts with the project values and nothing to save', () => {
        setup();
        expect(screen.getByLabelText('Project name')).toHaveValue('Shop');
        expect(screen.getByLabelText('Description')).toHaveValue('orders');
        expect(save()).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    });

    it('saves an edited name, and Discard restores the saved values', () => {
        const { onSave } = setup();
        const name = screen.getByLabelText('Project name');
        fireEvent.change(name, { target: { value: 'Store' } });
        expect(save()).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(name).toHaveValue('Shop');
        expect(save()).toBeDisabled();
        fireEvent.change(name, { target: { value: 'Store' } });
        fireEvent.click(save());
        expect(onSave).toHaveBeenCalledWith('Store', 'orders');
    });

    it('does not save a blank name, and is locked while busy', () => {
        setup(project(), true);
        fireEvent.change(screen.getByLabelText('Project name'), {
            target: { value: ' ' },
        });
        expect(save()).toBeDisabled();
    });

    it('a project that holds diagrams can be deleted, and the warning says they go too', () => {
        setup(project({ diagrams: 2 }));
        expect(screen.getByText(/all its diagrams/)).toBeTruthy();
        const section = screen.getByRole('region', { name: 'Delete project' });
        expect(
            within(section).getByRole('button', { name: 'Delete project' })
        ).toBeEnabled();
    });

    it('deleting asks for the project name; Cancel deletes nothing', () => {
        const { onDelete } = setup();
        const section = screen.getByRole('region', { name: 'Delete project' });
        fireEvent.click(
            within(section).getByRole('button', { name: 'Delete project' })
        );
        const confirm = screen.getByRole('alertdialog');
        const del = within(confirm).getByRole('button', {
            name: 'Delete project',
        });
        // nothing typed, or the wrong name: the button stays off
        expect(del).toBeDisabled();
        const input = within(confirm).getByLabelText(/type the project name/);
        fireEvent.change(input, { target: { value: 'shop' } });
        expect(del).toBeDisabled();
        fireEvent.click(del);
        expect(onDelete).not.toHaveBeenCalled();
        fireEvent.click(
            within(confirm).getByRole('button', { name: 'Cancel' })
        );
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('typing the exact name enables Delete and deletes once', () => {
        const { onDelete } = setup();
        const section = screen.getByRole('region', { name: 'Delete project' });
        fireEvent.click(
            within(section).getByRole('button', { name: 'Delete project' })
        );
        const confirm = screen.getByRole('alertdialog');
        fireEvent.change(
            within(confirm).getByLabelText(/type the project name/),
            { target: { value: 'Shop' } }
        );
        const del = within(confirm).getByRole('button', {
            name: 'Delete project',
        });
        expect(del).toBeEnabled();
        fireEvent.click(del);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});
