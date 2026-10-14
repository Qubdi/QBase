import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import { Spinner } from '@/components/spinner/spinner';
import {
    api,
    errorMessage,
    type MyProject,
    type RemoteDiagramSummary,
} from '@/lib/qubdi/api';
import { ProjectDiagrams } from './project-diagrams';

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
    const [diagrams, setDiagrams] = useState<RemoteDiagramSummary[] | null>(
        null
    );
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const canEdit = project.role !== 'viewer';

    const load = useCallback(async () => {
        setError(null);
        try {
            const all = await api.listDiagrams();
            setDiagrams(all.filter((d) => d.projectId === project.id));
        } catch (e) {
            setError(errorMessage(e));
            setDiagrams([]);
        }
    }, [project.id]);

    useEffect(() => {
        if (!open) return;
        setDiagrams(null);
        setQuery('');
        void load();
    }, [open, load]);

    const q = query.trim().toLowerCase();
    const shown = (diagrams ?? []).filter(
        (d) => !q || d.title.toLowerCase().includes(q)
    );

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && canClose) onClose();
            }}
        >
            <DialogContent
                className="max-w-xl"
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
                <div className="flex gap-2">
                    <Input
                        placeholder="Search diagrams…"
                        aria-label="Search diagrams"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {canEdit ? (
                        <Button className="shrink-0 gap-1" onClick={onCreate}>
                            <Plus className="size-4" />
                            New diagram
                        </Button>
                    ) : null}
                </div>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <div className="max-h-[50vh] overflow-y-auto pr-1">
                    {diagrams === null ? (
                        <Spinner className="mx-auto text-primary" />
                    ) : (
                        <ProjectDiagrams
                            diagrams={shown}
                            projectSlug={project.slug}
                            onChanged={() => void load()}
                            onNavigate={onClose}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
