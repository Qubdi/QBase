import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '../dialog';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
} from '../alert-dialog';

// Dialogs are opened by state, not through a Radix trigger: closing one must
// still give focus back to the control that was focused when it opened.
const Host: React.FC<{ alert?: boolean }> = ({ alert }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>opener</button>
            {alert ? (
                <AlertDialog open={open} onOpenChange={setOpen}>
                    <AlertDialogContent>
                        <AlertDialogTitle>t</AlertDialogTitle>
                    </AlertDialogContent>
                </AlertDialog>
            ) : (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent aria-describedby={undefined}>
                        <DialogTitle>t</DialogTitle>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
};

describe.each([false, true])(
    'focus returns after closing (alert=%s)',
    (alert) => {
        it('puts focus back on the control that opened the dialog', async () => {
            render(<Host alert={alert} />);
            const opener = screen.getByRole('button', { name: 'opener' });
            opener.focus();
            fireEvent.click(opener);
            const dialog = await screen.findByRole(
                alert ? 'alertdialog' : 'dialog'
            );
            fireEvent.keyDown(dialog, { key: 'Escape' });
            await waitFor(() =>
                expect(
                    screen.queryByRole(alert ? 'alertdialog' : 'dialog')
                ).toBeNull()
            );
            await waitFor(() => expect(document.activeElement).toBe(opener));
        });
    }
);
