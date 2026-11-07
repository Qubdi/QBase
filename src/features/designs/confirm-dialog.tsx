import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/platform/ui/alert-dialog';

export interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    /** red confirm button for deletions */
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

/** A modal question with a confirm and a cancel button (spec A11). */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    destructive,
    onConfirm,
    onCancel,
}) => (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                <AlertDialogAction
                    className={
                        destructive
                            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            : undefined
                    }
                    onClick={() => void onConfirm()}
                >
                    {confirmLabel}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
);
