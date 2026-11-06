import React, { useEffect, useMemo, useState } from 'react';
import { HardDrive, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/platform/ui/table';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import { api, errorMessage, type RemoteDiagramSummary } from '@/lib/qubdi/api';
import { countLabel, formatWhen } from '@/lib/qubdi/diagram-summary';
import { getLatestFromServer } from '@/lib/qubdi/get-latest';
import { clearRemoteId, findLocalId } from '@/lib/qubdi/remote-map';
import { useStorage } from '@/qbase/use-storage';

export interface ProjectDiagramsProps {
    diagrams: RemoteDiagramSummary[];
    projectSlug: string;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpen: (diagram: RemoteDiagramSummary) => void;
    /** the list is out of date: a diagram was deleted */
    onChanged: () => void;
}

type Pending =
    | { kind: 'delete'; diagram: RemoteDiagramSummary }
    | { kind: 'latest'; diagram: RemoteDiagramSummary; localId: string };

/**
 * The diagrams of a project as a table: pick one with the mouse or the arrow
 * keys, open it with a double click, Enter or Space, and manage it from the
 * row menu (open, get the latest version, delete for everyone).
 */
export const ProjectDiagrams: React.FC<ProjectDiagramsProps> = ({
    diagrams,
    projectSlug,
    selectedId,
    onSelect,
    onOpen,
    onChanged,
}) => {
    const { t } = useTranslation();
    const { listDiagrams, deleteDiagram } = useStorage();
    const [localIds, setLocalIds] = useState<ReadonlySet<string>>(new Set());
    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // which of these diagrams this browser holds a copy of
    useEffect(() => {
        let cancelled = false;
        void listDiagrams()
            .then((list) => {
                if (!cancelled) setLocalIds(new Set(list.map((d) => d.id)));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [listDiagrams, diagrams]);

    const localIdOf = useMemo(
        () => (d: RemoteDiagramSummary) => {
            const id = findLocalId(d.id);
            return id && localIds.has(id) ? id : undefined;
        },
        [localIds]
    );

    const close = () => {
        setPending(null);
        setError(null);
    };

    const confirm = async (event: React.MouseEvent) => {
        event.preventDefault();
        if (!pending || busy) return;
        setBusy(true);
        setError(null);
        try {
            if (pending.kind === 'delete') {
                await api.deleteDiagram(pending.diagram.id);
                const localId = localIdOf(pending.diagram);
                if (localId) {
                    await deleteDiagram(localId).catch(() => undefined);
                    clearRemoteId(localId);
                }
                setPending(null);
                onChanged();
            } else {
                await getLatestFromServer({
                    localId: pending.localId,
                    remoteId: pending.diagram.id,
                    projectSlug,
                    deleteLocal: deleteDiagram,
                });
            }
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    if (diagrams.length === 0)
        return (
            <p className="p-6 text-center text-sm text-muted-foreground">
                {t('qubdi.workspace.projectDiagrams.empty')}
            </p>
        );

    const move = (row: HTMLElement, step: 1 | -1) => {
        const next =
            step === 1 ? row.nextElementSibling : row.previousElementSibling;
        if (next instanceof HTMLElement) next.focus();
    };

    const head = (key: string) => t(`qubdi.workspace.projectDiagrams.${key}`);

    return (
        <>
            <Table aria-label={head('table')}>
                <TableHeader>
                    <TableRow>
                        <TableHead>{head('name')}</TableHead>
                        <TableHead>{head('createdBy')}</TableHead>
                        <TableHead>{head('created')}</TableHead>
                        <TableHead>{head('lastModified')}</TableHead>
                        <TableHead>{head('tables')}</TableHead>
                        <TableHead className="w-10">
                            <span className="sr-only" />
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {diagrams.map((d) => {
                        const localId = localIdOf(d);
                        const selected = d.id === selectedId;
                        return (
                            <TableRow
                                key={d.id}
                                tabIndex={0}
                                data-state={selected ? 'selected' : ''}
                                className="cursor-pointer"
                                onFocus={(e) => {
                                    if (e.target === e.currentTarget)
                                        onSelect(d.id);
                                }}
                                onClick={(e) => {
                                    if (e.detail >= 2) onOpen(d);
                                    else onSelect(d.id);
                                }}
                                onKeyDown={(e) => {
                                    // keys typed in the row's own menu belong to it
                                    if (e.target !== e.currentTarget) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onOpen(d);
                                    } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        move(e.currentTarget, 1);
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        move(e.currentTarget, -1);
                                    }
                                }}
                            >
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <DiagramIcon
                                            databaseType={d.databaseType}
                                        />
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-medium">
                                                {d.title}
                                            </span>
                                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                                {t(
                                                    `qubdi.workspace.projectDiagrams.role.${d.role}`
                                                )}
                                                {localId ? (
                                                    <span className="flex items-center gap-1">
                                                        <HardDrive className="size-3" />
                                                        {head('savedHere')}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>{d.ownerEmail ?? '—'}</TableCell>
                                <TableCell>{formatWhen(d.createdAt)}</TableCell>
                                <TableCell>{formatWhen(d.updatedAt)}</TableCell>
                                <TableCell
                                    title={t(
                                        'qubdi.workspace.projectDiagrams.counts',
                                        {
                                            tables: countLabel(
                                                d.tableCount,
                                                'table'
                                            ),
                                            relationships: countLabel(
                                                d.relationshipCount,
                                                'relationship'
                                            ),
                                        }
                                    )}
                                >
                                    {d.tableCount ?? 0}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                aria-label={t(
                                                    'qubdi.workspace.projectDiagrams.actionsFor',
                                                    { title: d.title }
                                                )}
                                            >
                                                <MoreHorizontal className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onSelect={() => onOpen(d)}
                                            >
                                                {head('open')}
                                            </DropdownMenuItem>
                                            {localId ? (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        setPending({
                                                            kind: 'latest',
                                                            diagram: d,
                                                            localId,
                                                        })
                                                    }
                                                >
                                                    {head(
                                                        'getLatestFromServer'
                                                    )}
                                                </DropdownMenuItem>
                                            ) : null}
                                            {d.role === 'owner' ? (
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onSelect={() =>
                                                        setPending({
                                                            kind: 'delete',
                                                            diagram: d,
                                                        })
                                                    }
                                                >
                                                    {head('deleteForEveryone')}
                                                </DropdownMenuItem>
                                            ) : null}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <AlertDialog
                open={pending !== null}
                onOpenChange={(open) => !open && close()}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.kind === 'latest'
                                ? head('discardTitle')
                                : head('deleteTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending
                                ? t(
                                      pending.kind === 'latest'
                                          ? 'qubdi.workspace.projectDiagrams.discardDescription'
                                          : 'qubdi.workspace.projectDiagrams.deleteDescription',
                                      { title: pending.diagram.title }
                                  )
                                : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            {head('cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => void confirm(e)}
                        >
                            {pending?.kind === 'latest'
                                ? head('getLatest')
                                : head('deleteForEveryone')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
