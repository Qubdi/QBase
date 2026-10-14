import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
            const all = await api.listDiagrams();
            setDiagrams(
                all
                    .filter((d) => d.projectId === project.id)
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            );
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
                className="flex h-[30rem] max-h-screen max-w-none flex-col md:min-w-[80vw] xl:min-w-[55vw]"
                showClose={canClose}
                onInteractOutside={(e) => !canClose && e.preventDefault()}
                onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{project.name}</DialogTitle>
                    <DialogDescription>
                        Open a diagram from this project
                        {canEdit ? ', or create a new one.' : '.'}
                    </DialogDescription>
                </DialogHeader>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search diagrams…"
                    label="Search diagrams"
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
                            No diagrams match &ldquo;{query.trim()}&rdquo;.
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
                            Cancel
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
                                New diagram
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            disabled={!selected}
                            onClick={() => selected && openDiagram(selected)}
                        >
                            Open diagram
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
