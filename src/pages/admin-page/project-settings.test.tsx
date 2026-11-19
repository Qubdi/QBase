import React from 'react';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

const acting = vi.hoisted(() => ({ mfaEnabled: false }));
vi.mock('@/hooks/use-qubdi', () => ({
    useQubdi: () => ({ user: { id: 'me', mfaEnabled: acting.mfaEnabled } }),
}));

const setup = (p = project(), busy = false) => {
    const onSave = vi.fn();
    // resolves to null once the project is gone, or to why it could not be
    const onDelete = vi.fn().mockResolvedValue(null);
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

    const openConfirm = () => {
        const section = screen.getByRole('region', { name: 'Delete project' });
        fireEvent.click(
            within(section).getByRole('button', { name: 'Delete project' })
        );
        return screen.getByRole('alertdialog');
    };
    const confirmButton = (dialog: HTMLElement) =>
        within(dialog).getByRole('button', { name: 'Delete project' });

    it('typing the exact name and your own password enables Delete, and deletes once with the proof', async () => {
        acting.mfaEnabled = false;
        const { onDelete } = setup();
        const confirm = openConfirm();
        fireEvent.change(
            within(confirm).getByLabelText(/type the project name/),
            { target: { value: 'Shop' } }
        );
        // the name alone is not enough (SEC-048)
        expect(confirmButton(confirm)).toBeDisabled();
        fireEvent.change(within(confirm).getByLabelText('Your password'), {
            target: { value: 'my-own-password' },
        });
        expect(confirmButton(confirm)).toBeEnabled();
        fireEvent.click(confirmButton(confirm));
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(onDelete).toHaveBeenCalledWith({
            adminPassword: 'my-own-password',
        });
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull()
        );
    });

    it('asks for a code too when the admin has two-factor on, and sends it', async () => {
        acting.mfaEnabled = true;
        const { onDelete } = setup();
        const confirm = openConfirm();
        await userEvent.type(
            within(confirm).getByLabelText(/type the project name/),
            'Shop'
        );
        await userEvent.type(
            within(confirm).getByLabelText('Your password'),
            'my-own-password'
        );
        expect(confirmButton(confirm)).toBeDisabled();
        await userEvent.type(
            within(confirm).getByLabelText('Your code'),
            ' 123456 '
        );
        expect(confirmButton(confirm)).toBeEnabled();
        await userEvent.click(confirmButton(confirm));
        expect(onDelete).toHaveBeenCalledWith({
            adminPassword: 'my-own-password',
            adminCode: '123456',
        });
        acting.mfaEnabled = false;
    });

    it('stays open and says why when the password is refused, so it can be corrected', async () => {
        acting.mfaEnabled = false;
        const { onDelete } = setup();
        onDelete.mockResolvedValueOnce('That password is not right.');
        const confirm = openConfirm();
        fireEvent.change(
            within(confirm).getByLabelText(/type the project name/),
            { target: { value: 'Shop' } }
        );
        fireEvent.change(within(confirm).getByLabelText('Your password'), {
            target: { value: 'wrong' },
        });
        fireEvent.click(confirmButton(confirm));
        expect(await within(confirm).findByRole('alert')).toHaveTextContent(
            'That password is not right.'
        );
        expect(screen.getByRole('alertdialog')).toBeTruthy();
    });
});
