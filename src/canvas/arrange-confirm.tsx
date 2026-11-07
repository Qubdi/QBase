import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@/platform/ui/alert-dialog';

interface Props {
    open: boolean;
    onConfirm(): void;
    onCancel(): void;
}

/** Auto Arrange moves every visible table, so it asks first (EDT-050). */
export function ArrangeConfirm({ open, onConfirm, onCancel }: Props) {
    const { t } = useTranslation();
    const words = {
        heading: t('canvas.arrange.title'),
        body: t('canvas.arrange.text'),
        no: t('canvas.arrange.cancel'),
        yes: t('canvas.arrange.confirm'),
    };
    const closeIfDismissed = (stillOpen: boolean) => {
        if (stillOpen === false) onCancel();
    };

    return (
        <Dialog.AlertDialog open={open} onOpenChange={closeIfDismissed}>
            <Dialog.AlertDialogContent>
                <Dialog.AlertDialogHeader>
                    <Dialog.AlertDialogTitle>
                        {words.heading}
                    </Dialog.AlertDialogTitle>
                    <Dialog.AlertDialogDescription>
                        {words.body}
                    </Dialog.AlertDialogDescription>
                </Dialog.AlertDialogHeader>
                <Dialog.AlertDialogFooter>
                    <Dialog.AlertDialogCancel>
                        {words.no}
                    </Dialog.AlertDialogCancel>{' '}
                    <Dialog.AlertDialogAction onClick={onConfirm}>
                        {words.yes}
                    </Dialog.AlertDialogAction>
                </Dialog.AlertDialogFooter>
            </Dialog.AlertDialogContent>
        </Dialog.AlertDialog>
    );
}
