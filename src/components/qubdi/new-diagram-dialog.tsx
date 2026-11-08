import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { databaseLogo } from '@/components/diagram-icon/database-logos';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
import { Label } from '@/platform/ui/label';
import { useTheme } from '@/platform/theme/theme-context';
import { useDialog } from '@/hooks/use-dialog';
import { cn } from '@/lib/utils/utils';
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

/** The cards, in the order of the New dialog in the editor: the common databases first. */
const CARD_ORDER: readonly string[] = [
    'mysql',
    'postgresql',
    'mariadb',
    'sqlite',
    'sql_server',
    'oracle',
];
const DATABASES: DatabaseType[] = Object.values(DatabaseType)
    .filter((t) => (t as string) !== 'generic')
    .sort((a, b) => {
        const ia = CARD_ORDER.indexOf(a);
        const ib = CARD_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

/** One database as a card: its logo, with its name for a screen reader. */
const DatabaseCard: React.FC<{
    type: DatabaseType;
    chosen: boolean;
    onPick: (type: DatabaseType) => void;
}> = ({ type, chosen, onPick }) => {
    const { resolvedTheme } = useTheme();
    const logo = databaseLogo(type, resolvedTheme);
    return (
        <button
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onPick(type)}
            className={cn(
                'flex size-32 flex-col items-center justify-center rounded-md p-2 text-center text-sm text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:size-20',
                chosen && 'bg-secondary text-foreground ring-2 ring-primary'
            )}
        >
            {logo ? (
                <img
                    src={logo}
                    alt=""
                    className="w-26 max-sm:w-14"
                    draggable={false}
                />
            ) : null}
            <span className={cn('text-foreground', logo && 'sr-only')}>
                {databaseTypeToLabelMap[type]}
            </span>
        </button>
    );
};

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

    const dialogs = useDialog();
    const showExamples = () => {
        onOpenChange(false);
        dialogs.openExamplesDialog();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[900px]" showClose>
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
                <form onSubmit={create} className="flex flex-col gap-4">
                    <div className="mx-auto flex w-full max-w-[416px] flex-col gap-2">
                        <Label
                            htmlFor="new-diagram-name"
                            className="text-xs font-bold text-slate-600 dark:text-slate-300"
                        >
                            {t('qubdi.workspace.newDiagram.nameLabel')}
                        </Label>
                        <Input
                            id="new-diagram-name"
                            aria-label={t(
                                'qubdi.workspace.newDiagram.nameLabel'
                            )}
                            placeholder={t(
                                'qubdi.workspace.newDiagram.defaultName'
                            )}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={200}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opened on request; focus goes to its first field
                            autoFocus
                        />
                    </div>
                    <div
                        role="radiogroup"
                        aria-label={t(
                            'qubdi.workspace.newDiagram.databaseType'
                        )}
                        className="mx-auto grid w-fit grid-cols-3 content-start gap-4"
                    >
                        {DATABASES.map((type) => (
                            <DatabaseCard
                                key={type}
                                type={type}
                                chosen={databaseType === type}
                                onPick={setDatabaseType}
                            />
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="mx-auto h-8 w-[416px] max-w-full text-primary"
                        onClick={showExamples}
                    >
                        <LayoutGrid />
                        {t('editor.designs.create.checkExamples')}
                    </Button>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter className="gap-4 sm:justify-between sm:space-x-0">
                        <div className="flex gap-2 max-sm:flex-col">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onOpenChange(false)}
                            >
                                {t('editor.common.cancel')}
                            </Button>
                            {onImport ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={onImport}
                                >
                                    {t('qubdi.workspace.newDiagram.import')}
                                </Button>
                            ) : null}
                        </div>
                        <Button type="submit" disabled={busy}>
                            {busy
                                ? t('qubdi.workspace.newDiagram.creating')
                                : t('qubdi.workspace.newDiagram.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
