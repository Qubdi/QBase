import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from './alert-dialog';

const Demo = ({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) => (
    <AlertDialog defaultOpen onOpenChange={onOpenChange}>
        <AlertDialogContent>
            <AlertDialogTitle>Sure?</AlertDialogTitle>
            <AlertDialogDescription>Really.</AlertDialogDescription>
        </AlertDialogContent>
    </AlertDialog>
);

describe('AlertDialog', () => {
    it('closes when the dark area outside it is clicked', () => {
        const onOpenChange = vi.fn();
        render(<Demo onOpenChange={onOpenChange} />);
        const overlay = document.querySelector('.bg-black\\/60')!;
        fireEvent.click(overlay);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('stays open when its own content is clicked', () => {
        const onOpenChange = vi.fn();
        render(<Demo onOpenChange={onOpenChange} />);
        fireEvent.click(screen.getByText('Really.'));
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog')).toBeTruthy();
    });
});
