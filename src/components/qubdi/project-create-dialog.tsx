import React, { useState } from 'react';
import type { MyProject } from '@/lib/qubdi/api';
import { ImportFromDatabaseDialog } from './import-from-database-dialog';
import { NewDiagramDialog } from './new-diagram-dialog';

export interface ProjectCreateDialogProps {
    open: boolean;
    project: MyProject;
    onClose: () => void;
}

/**
 * Creates a diagram inside the open project: blank, or imported from a
 * database. Viewers cannot create anything, so they never get the dialog.
 */
export const ProjectCreateDialog: React.FC<ProjectCreateDialogProps> = ({
    open,
    project,
    onClose,
}) => {
    const [importOpen, setImportOpen] = useState(false);

    if (project.role === 'viewer') return null;

    return (
        <>
            <NewDiagramDialog
                open={open && !importOpen}
                onOpenChange={(next) => !next && onClose()}
                projectId={project.id}
                projectName={project.name}
                projectSlug={project.slug}
                onImport={() => setImportOpen(true)}
            />
            <ImportFromDatabaseDialog
                open={open && importOpen}
                onOpenChange={(next) => {
                    if (!next) {
                        setImportOpen(false);
                        onClose();
                    }
                }}
                projectId={project.id}
                projectSlug={project.slug}
            />
        </>
    );
};
