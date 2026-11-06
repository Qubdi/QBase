import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { OptionSelect } from '@/components/option-select/option-select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
import { useQubdi } from '@/hooks/use-qubdi';
import { useStorage } from '@/qbase/use-storage';
import { DatabaseType, databaseTypeToLabelMap } from '@/qbase/diagram-types';
import { errorMessage } from '@/lib/qubdi/api';
import { emptyDiagram } from '@/lib/qubdi/new-diagram';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import { generateId } from '@/lib/utils';

export interface NewDiagramDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string;
    projectName: string;
    projectSlug: string;
    /** Shows an "Import from database" shortcut when given. */
    onImport?: () => void;
}

const DATABASE_OPTIONS = Object.values(DatabaseType).map((t) => ({
    value: t,
    label: databaseTypeToLabelMap[t],
}));

export const NewDiagramDialog: React.FC<NewDiagramDialogProps> = ({
    open,
    onOpenChange,
    projectId,
    projectName,
    projectSlug,
    onImport,
}) => {
    const { t } = useTranslation();
    const { addDiagram, deleteDiagram } = useStorage();
    const { syncDiagram } = useQubdi();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [databaseType, setDatabaseType] = useState<DatabaseType>(
        DatabaseType.POSTGRESQL
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const diagram = emptyDiagram({ id: generateId(), name, databaseType });
        try {
            await addDiagram({ diagram });
            // created in the project right away: nothing exists outside one
            const remoteId = await syncDiagram(diagram, projectId);
            onOpenChange(false);
            setName('');
            navigate(projectDiagramPath(projectSlug, remoteId));
        } catch (err) {
            // do not leave a local diagram that is not in any project behind
            await deleteDiagram(diagram.id).catch(() => undefined);
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {t('qubdi.workspace.newDiagram.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('qubdi.workspace.newDiagram.description', {
                            project: projectName,
                        })}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={create} className="flex flex-col gap-3">
                    <Input
                        aria-label={t('qubdi.workspace.newDiagram.nameLabel')}
                        placeholder={t('qubdi.workspace.newDiagram.nameLabel')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={200}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opened on request; focus goes to its first field
                        autoFocus
                    />
                    <OptionSelect
                        aria-label={t(
                            'qubdi.workspace.newDiagram.databaseType'
                        )}
                        value={databaseType}
                        onValueChange={(v) =>
                            setDatabaseType(v as DatabaseType)
                        }
                        options={DATABASE_OPTIONS}
                    />
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <Button type="submit" disabled={busy}>
                        {busy
                            ? t('qubdi.workspace.newDiagram.creating')
                            : t('qubdi.workspace.newDiagram.create')}
                    </Button>
                    {onImport ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onImport}
                        >
                            {t('qubdi.workspace.newDiagram.import')}
                        </Button>
                    ) : null}
                </form>
            </DialogContent>
        </Dialog>
    );
};
