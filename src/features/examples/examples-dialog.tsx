import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useWorkspace } from '@/components/qubdi/workspace-context';
import { useQubdi } from '@/hooks/use-qubdi';
import { storeNewDesign } from '@/features/designs/design-service';
import { buildExample } from './build-example';
import { designToDiagram } from '@/qbase/diagram-convert';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useStorage } from '@/qbase/use-storage';
import { ExamplesGrid } from './examples-grid';
import type { Example } from './examples';

/**
 * The list of examples on its own (the Actions menu opens it). Choosing one
 * makes a new diagram: in the open project when there is one, otherwise in
 * this browser.
 */
export const ExamplesDialog: React.FC<{ onClose: () => void }> = ({
    onClose,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const adapter = useStorageAdapter();
    const workspace = useWorkspace();
    const { addDiagram, deleteDiagram } = useStorage();
    const { syncDiagram } = useQubdi();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();

    const open = async (example: Example) => {
        setBusy(true);
        setProblem(undefined);
        try {
            const built = await buildExample(example.domain);
            if ('problem' in built) throw new Error(built.problem);
            const design = built.design;
            if (workspace) {
                const diagram = designToDiagram(design);
                await addDiagram({ diagram });
                try {
                    // nothing lives outside a project: create it there right away
                    const remoteId = await syncDiagram(
                        diagram,
                        workspace.project.id
                    );
                    navigate(
                        projectDiagramPath(workspace.project.slug, remoteId)
                    );
                } catch (error) {
                    await deleteDiagram(diagram.id).catch(() => undefined);
                    throw error;
                }
            } else {
                await storeNewDesign(adapter, design);
                navigate(`/diagrams/${design.id}`);
            }
            onClose();
        } catch {
            setProblem(t('editor.designs.create.failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent className="max-w-[900px]">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.designs.create.titleExamples')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.designs.create.descriptionExamples')}
                    </DialogDescription>
                </DialogHeader>
                <ExamplesGrid disabled={busy} onPick={open} />
                {problem ? (
                    <p role="alert" className="text-sm text-destructive">
                        {problem}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={busy}
                    >
                        {t('editor.common.cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
