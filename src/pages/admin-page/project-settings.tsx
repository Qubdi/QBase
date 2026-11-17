import React, { useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { Label } from '@/platform/ui/label';
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
import { projectHomePath } from '@/lib/qubdi/project-path';
import type { AdminProject } from '@/lib/qubdi/api';

export interface ProjectSettingsProps {
    project: AdminProject;
    busy: boolean;
    onSave: (name: string, description: string) => void;
    onDelete: () => void;
}

/** Rename or describe the project, or delete it with everything inside, after typing its name. */
export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
    project,
    busy,
    onSave,
    onDelete,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const fieldId = useId();

    // the form follows the project when it, or its saved text, changes
    const [synced, setSynced] = useState({
        id: project.id,
        name: project.name,
        description: project.description,
    });
    if (
        synced.id !== project.id ||
        synced.name !== project.name ||
        synced.description !== project.description
    ) {
        setSynced({
            id: project.id,
            name: project.name,
            description: project.description,
        });
        setName(project.name);
        setDescription(project.description);
    }

    const unchanged =
        name === project.name && description === project.description;
    // like deleting a repository on GitHub: the admin types the name to confirm
    const [typed, setTyped] = useState('');
    const confirmed = typed === project.name;

    return (
        <div className="flex flex-col gap-6">
            <form
                className="flex flex-col gap-3"
                aria-label={t('qubdi.adminProjects.settings.detailsLabel')}
                onSubmit={(e) => {
                    e.preventDefault();
                    onSave(name, description);
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${fieldId}-name`}>
                        {t('qubdi.adminProjects.settings.projectName')}
                    </Label>
                    <Input
                        id={`${fieldId}-name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${fieldId}-description`}>
                        {t('qubdi.adminProjects.settings.description')}
                    </Label>
                    <Input
                        id={`${fieldId}-description`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={500}
                        placeholder={t(
                            'qubdi.adminProjects.settings.descriptionPlaceholder'
                        )}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    <Trans
                        i18nKey="qubdi.adminProjects.settings.webAddress"
                        values={{ path: projectHomePath(project.slug) }}
                        components={{ code: <code /> }}
                    />
                </p>
                <div className="flex gap-2">
                    <Button
                        type="submit"
                        variant="secondary"
                        disabled={busy || unchanged || !name.trim()}
                    >
                        {t('qubdi.adminProjects.settings.saveChanges')}
                    </Button>
                    {!unchanged ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                                setName(project.name);
                                setDescription(project.description);
                            }}
                        >
                            {t('qubdi.adminProjects.settings.discard')}
                        </Button>
                    ) : null}
                </div>
            </form>

            <section
                aria-label={t('qubdi.adminProjects.settings.deleteLabel')}
                className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4"
            >
                <h3 className="text-sm font-semibold">
                    {t('qubdi.adminProjects.settings.deleteHeading')}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {t('qubdi.adminProjects.settings.removes')}
                </p>
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={busy}
                        onClick={() => {
                            setTyped('');
                            setConfirmDelete(true);
                        }}
                    >
                        {t('qubdi.adminProjects.settings.deleteButton')}
                    </Button>
                </div>
            </section>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('qubdi.adminProjects.settings.confirmTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive">
                            <Trans
                                i18nKey="qubdi.adminProjects.settings.confirmBody"
                                values={{ name: project.name }}
                                components={{
                                    strong: (
                                        <strong className="font-semibold break-all" />
                                    ),
                                }}
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex flex-col gap-3">
                        {/* not a <Label>: Radix blocks double-click selection on it, and the name should be selectable to copy */}
                        <p
                            id={`${fieldId}-confirm-label`}
                            className="select-text text-sm font-medium leading-snug"
                        >
                            <Trans
                                i18nKey="qubdi.adminProjects.settings.confirmPrompt"
                                values={{ name: project.name }}
                                components={{
                                    strong: (
                                        <strong className="font-semibold break-all" />
                                    ),
                                }}
                            />
                        </p>
                        <Input
                            id={`${fieldId}-confirm`}
                            aria-labelledby={`${fieldId}-confirm-label`}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('qubdi.adminProjects.settings.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!confirmed || busy}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={onDelete}
                        >
                            {t('qubdi.adminProjects.settings.deleteButton')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
