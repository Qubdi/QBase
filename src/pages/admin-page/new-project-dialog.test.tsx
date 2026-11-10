import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/qubdi/api';
import { NewProjectDialog } from './new-project-dialog';

const NAME = 'Project name';
const CREATE = 'Create project';

const setup = (onCreate = vi.fn().mockResolvedValue(undefined)) => {
    const onOpenChange = vi.fn();
    render(
        <NewProjectDialog
            open
            onOpenChange={onOpenChange}
            onCreate={onCreate}
        />
    );
    return { onCreate, onOpenChange };
};

const submitButton = () => screen.getByRole('button', { name: CREATE });

describe('NewProjectDialog', () => {
    it('cannot be submitted with a blank name', () => {
        setup();
        expect(submitButton()).toBeDisabled();
        fireEvent.change(screen.getByLabelText(NAME), {
            target: { value: '   ' },
        });
        expect(submitButton()).toBeDisabled();
    });

    it('creates with the trimmed name and description, then closes', async () => {
        const { onCreate, onOpenChange } = setup();
        fireEvent.change(screen.getByLabelText(NAME), {
            target: { value: '  Shop  ' },
        });
        fireEvent.change(screen.getByLabelText('Description (optional)'), {
            target: { value: ' orders ' },
        });
        fireEvent.click(submitButton());
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(onCreate).toHaveBeenCalledWith('Shop', 'orders');
    });

    it('stays open and says why when the server refuses', async () => {
        const onCreate = vi
            .fn()
            .mockRejectedValue(new ApiError(409, 'name_taken', 'taken'));
        const { onOpenChange } = setup(onCreate);
        fireEvent.change(screen.getByLabelText(NAME), {
            target: { value: 'Shop' },
        });
        fireEvent.click(submitButton());
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalled();
        // the name stays so it can be corrected
        expect(screen.getByLabelText(NAME)).toHaveValue('Shop');
    });

    it('Cancel closes without creating', () => {
        const { onCreate, onOpenChange } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onCreate).not.toHaveBeenCalled();
    });
});
