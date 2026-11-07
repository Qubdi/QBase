import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
import '@/i18n/editor/register';

export interface RenameDesignDialogProps {
    /** the design being renamed; undefined keeps the dialog closed */
    target?: { id: string; name: string };
    onRename: (id: string, name: string) => Promise<void> | void;
    onClose: () => void;
}

/** A small form to rename a stored design; a blank name keeps the old one. */
export const RenameDesignDialog: React.FC<RenameDesignDialogProps> = ({
    target,
    onRename,
    onClose,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    useEffect(() => setName(target?.name ?? ''), [target]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target) return;
        if (name.trim() !== '') await onRename(target.id, name.trim());
        onClose();
    };

    return (
        <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.designs.rename.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.designs.rename.description')}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="flex flex-col gap-4">
                    <Input
                        value={name}
                        maxLength={200}
                        aria-label={t('editor.designs.rename.label')}
                        onChange={(e) => setName(e.target.value)}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opened on request
                        autoFocus
                    />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            {t('editor.common.cancel')}
                        </Button>
                        <Button type="submit" disabled={name.trim() === ''}>
                            {t('editor.designs.rename.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
