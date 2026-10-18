import React, { useEffect, useId, useState } from 'react';
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Rename or describe the project, or delete it when it holds no diagrams. */
export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
    project,
    busy,
    onSave,
    onDelete,
}) => {
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
                aria-label="Project details"
                onSubmit={(e) => {
                    e.preventDefault();
                    onSave(name, description);
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${fieldId}-name`}>Project name</Label>
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
                        Description
                    </Label>
                    <Input
                        id={`${fieldId}-description`}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={500}
                        placeholder="What the diagrams in this project are for"
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    Web address: <code>{projectHomePath(project.slug)}</code>.
                    Renaming the project changes it.
                </p>
                <div className="flex gap-2">
                    <Button
                        type="submit"
                        variant="secondary"
                        disabled={busy || unchanged || !name.trim()}
                    >
                        Save changes
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
                            Discard
                        </Button>
                    ) : null}
                </div>
            </form>

            <section
                aria-label="Delete project"
                className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-4"
            >
                <h3 className="text-sm font-semibold">Delete this project</h3>
                <p className="text-sm text-muted-foreground">
                    {blocked
                        ? `It still holds ${plural(project.diagrams, 'diagram')}. Delete them, or move them to another project in the editor, then it can be deleted.`
                        : 'Removes the project and who was assigned to it.'}
                </p>
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={busy || blocked}
                        onClick={() => setConfirmDelete(true)}
                    >
                        Delete project
                    </Button>
                </div>
            </section>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete project?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {project.name} and its member assignments will be
                            removed. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onDelete}>
                            Delete project
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
