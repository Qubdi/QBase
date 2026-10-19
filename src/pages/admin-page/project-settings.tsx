import React, { useEffect, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { Label } from '@/components/label/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/alert-dialog/alert-dialog';
import { projectHomePath } from '@/lib/qubdi/project-path';
import type { AdminProject } from '@/lib/qubdi/api';

export interface ProjectSettingsProps {
    project: AdminProject;
    busy: boolean;
    onSave: (name: string, description: string) => void;
    onDelete: () => void;
}

/** Rename or describe the project, or delete it when it holds no diagrams. */
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

    useEffect(() => {
        setName(project.name);
        setDescription(project.description);
    }, [project.id, project.name, project.description]);

    const unchanged =
        name === project.name && description === project.description;
    // the server refuses to delete a project that still holds diagrams; say so
    // here instead of letting the admin confirm and then fail
    const blocked = project.diagrams > 0;

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
                    {blocked
                        ? t('qubdi.adminProjects.settings.blocked', {
                              count: project.diagrams,
                          })
                        : t('qubdi.adminProjects.settings.removes')}
                </p>
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={busy || blocked}
                        onClick={() => setConfirmDelete(true)}
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
                        <AlertDialogDescription>
                            {t('qubdi.adminProjects.settings.confirmBody', {
                                name: project.name,
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('qubdi.adminProjects.settings.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={onDelete}>
                            {t('qubdi.adminProjects.settings.deleteButton')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
