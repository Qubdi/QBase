import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogInternalContent,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Spinner } from '@/components/spinner/spinner';
import {
    api,
    errorMessage,
    type MyProject,
    type RemoteDiagramSummary,
} from '@/lib/qubdi/api';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import { ProjectDiagrams } from './project-diagrams';
import { SearchInput } from './search-input';

export interface ProjectOpenDialogProps {
    open: boolean;
    project: MyProject;
    /** false when the editor has no diagram open, so the dialog cannot be dismissed */
    canClose?: boolean;
    onClose: () => void;
    onCreate: () => void;
}

/** Lists the project's diagrams so one can be opened (or a new one created). */
export const ProjectOpenDialog: React.FC<ProjectOpenDialogProps> = ({
    open,
    project,
    canClose = true,
    onClose,
    onCreate,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [diagrams, setDiagrams] = useState<RemoteDiagramSummary[] | null>(
        null
    );
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const canEdit = project.role !== 'viewer';

    const load = useCallback(async () => {
        setError(null);
        try {
            // the server keeps to this project's diagrams, newest first
            setDiagrams(await api.listDiagrams({ projectId: project.id }));
        } catch (e) {
            setError(errorMessage(e));
            setDiagrams([]);
        }
    }, [project.id]);

    useEffect(() => {
        if (!open) return;
        setDiagrams(null);
        setQuery('');
        setSelectedId(null);
        void load();
    }, [open, load]);

    const q = query.trim().toLowerCase();
    const shown = (diagrams ?? []).filter(
        (d) => !q || d.title.toLowerCase().includes(q)
    );
    const selected = shown.find((d) => d.id === selectedId);

    const openDiagram = (d: RemoteDiagramSummary) => {
        onClose();
        navigate(projectDiagramPath(project.slug, d.id));
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && canClose) onClose();
            }}
        >
            <DialogContent
                // wide enough for the table, never the whole screen
                className="flex h-[30rem] max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col"
                showClose={canClose}
                onInteractOutside={(e) => !canClose && e.preventDefault()}
                onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{project.name}</DialogTitle>
                    <DialogDescription>
                        {canEdit
                            ? t('qubdi.workspace.projectOpen.descriptionEdit')
                            : t('qubdi.workspace.projectOpen.descriptionView')}
                    </DialogDescription>
                </DialogHeader>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={t(
                        'qubdi.workspace.projectOpen.searchPlaceholder'
                    )}
                    label={t('qubdi.workspace.projectOpen.searchLabel')}
                />
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <DialogInternalContent>
                    {diagrams === null ? (
                        <Spinner className="mx-auto mt-8 text-primary" />
                    ) : shown.length === 0 && q ? (
                        <p className="p-6 text-center text-sm text-muted-foreground">
                            {t('qubdi.workspace.projectOpen.noMatch', {
                                query: query.trim(),
                            })}
                        </p>
                    ) : (
                        <ProjectDiagrams
                            diagrams={shown}
                            projectSlug={project.slug}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            onOpen={openDiagram}
                            onChanged={() => void load()}
                        />
                    )}
                </DialogInternalContent>
                <DialogFooter className="flex !justify-between gap-2">
                    {canClose ? (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                        >
                            {t('qubdi.workspace.projectOpen.cancel')}
                        </Button>
                    ) : (
                        <div />
                    )}
                    <div className="flex gap-2">
                        {canEdit ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="gap-1"
                                onClick={onCreate}
                            >
                                <Plus className="size-4" />
                                {t('qubdi.workspace.projectOpen.newDiagram')}
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            disabled={!selected}
                            onClick={() => selected && openDiagram(selected)}
                        >
                            {t('qubdi.workspace.projectOpen.openDiagram')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
