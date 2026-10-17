import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
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
import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/table/table';
import { useStorage } from '@/hooks/use-storage';
import { api, errorMessage, type RemoteDiagramSummary } from '@/lib/qubdi/api';
import {
    countLabel,
    formatWhen,
    toDatabaseEdition,
    toDatabaseType,
} from '@/lib/qubdi/diagram-summary';
import { getLatestFromServer } from '@/lib/qubdi/get-latest';
import { clearRemoteId, findLocalId } from '@/lib/qubdi/remote-map';

export interface ProjectDiagramsProps {
    diagrams: RemoteDiagramSummary[];
    projectSlug: string;
    selectedId: string | null;
    onSelect: (id: string) => void;
    /** Opens a diagram (double-click, Enter, or the row menu). */
    onOpen: (diagram: RemoteDiagramSummary) => void;
    /** Called after a diagram was deleted so the caller can reload its list. */
    onChanged?: () => void;
}

const roleLabel = (role: RemoteDiagramSummary['role']) =>
    role === 'owner' ? 'Admin' : role === 'editor' ? 'Editor' : 'Viewer';

type Confirm =
    | { kind: 'latest'; diagram: RemoteDiagramSummary }
    | { kind: 'delete'; diagram: RemoteDiagramSummary };

/** The diagrams of one project, laid out like the original Open dialog. */
export const ProjectDiagrams: React.FC<ProjectDiagramsProps> = ({
    diagrams,
    projectSlug,
    selectedId,
    onSelect,
    onOpen,
    onChanged,
}) => {
    const { deleteDiagram, listDiagrams } = useStorage();
    const [localIds, setLocalIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<Confirm | null>(null);
    const body = useRef<HTMLTableSectionElement>(null);

    useEffect(() => {
        listDiagrams()
            .then((local) => setLocalIds(new Set(local.map((d) => d.id))))
            .catch(() => setLocalIds(new Set()));
    }, [listDiagrams, diagrams]);

    /** The copy of a server diagram that already exists in this browser. */
    const localCopy = useCallback(
        (remoteId: string) => {
            const id = findLocalId(remoteId);
            return id && localIds.has(id) ? id : undefined;
        },
        [localIds]
    );

    const moveFocus = (from: HTMLElement, step: 1 | -1) => {
        const rows = Array.from(
            body.current?.querySelectorAll<HTMLElement>(
                'tr[data-diagram-id]'
            ) ?? []
        );
        rows[rows.indexOf(from) + step]?.focus();
    };

    const onRowKeyDown = (
        e: React.KeyboardEvent<HTMLTableRowElement>,
        d: RemoteDiagramSummary
    ) => {
        // keys typed inside the row menu belong to the menu
        if (e.target !== e.currentTarget) return;
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                onOpen(d);
                break;
            case 'ArrowDown':
                e.preventDefault();
                moveFocus(e.currentTarget, 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveFocus(e.currentTarget, -1);
                break;
        }
    };

    const getLatest = async (d: RemoteDiagramSummary) => {
        const existing = localCopy(d.id);
        if (!existing) return;
        setBusy(true);
        try {
            await getLatestFromServer({
                localId: existing,
                remoteId: d.id,
                projectSlug,
                deleteLocal: deleteDiagram,
            });
        } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
            setConfirm(null);
        }
    };

    // only admins (role 'owner') may delete; the server enforces it too
    const remove = async (d: RemoteDiagramSummary) => {
        setError(null);
        setBusy(true);
        try {
            await api.deleteDiagram(d.id);
            const local = findLocalId(d.id);
            if (local) {
                await deleteDiagram(local).catch(() => undefined);
                clearRemoteId(local);
            }
            onChanged?.();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
            setConfirm(null);
        }
    };

    if (diagrams.length === 0) {
        return (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No diagrams in this project yet.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            <Table aria-label="Diagrams">
                <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                        <TableHead className="w-12" />
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">
                            Created by
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                            Created
                        </TableHead>
                        <TableHead>Last modified</TableHead>
                        <TableHead className="text-center">Tables</TableHead>
                        <TableHead className="w-10" />
                    </TableRow>
                </TableHeader>
                <TableBody ref={body}>
                    {diagrams.map((d) => (
                        <TableRow
                            key={d.id}
                            data-diagram-id={d.id}
                            data-state={selectedId === d.id ? 'selected' : ''}
                            tabIndex={0}
                            className="cursor-pointer focus:bg-accent focus:outline-hidden"
                            onFocus={() => onSelect(d.id)}
                            onClick={(e) => {
                                onSelect(d.id);
                                if (e.detail === 2) onOpen(d);
                            }}
                            onKeyDown={(e) => onRowKeyDown(e, d)}
                        >
                            <TableCell>
                                <div className="flex justify-center">
                                    <DiagramIcon
                                        databaseType={toDatabaseType(
                                            d.databaseType
                                        )}
                                        databaseEdition={toDatabaseEdition(
                                            d.databaseEdition
                                        )}
                                    />
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-medium">
                                        {d.title}
                                    </span>
                                    <Badge variant="secondary">
                                        {roleLabel(d.role)}
                                    </Badge>
                                </div>
                                {localCopy(d.id) ? (
                                    <p className="text-xs text-muted-foreground">
                                        Saved in this browser
                                    </p>
                                ) : null}
                            </TableCell>
                            <TableCell className="hidden max-w-40 truncate md:table-cell">
                                {d.ownerEmail ?? '—'}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                                {formatWhen(d.createdAt)}
                            </TableCell>
                            <TableCell>{formatWhen(d.updatedAt)}</TableCell>
                            <TableCell
                                className="text-center"
                                title={`${countLabel(d.tableCount, 'table')}, ${countLabel(d.relationshipCount, 'relationship')}`}
                            >
                                {d.tableCount ?? 0}
                            </TableCell>
                            <TableCell className="p-0 pr-1 text-right">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            aria-label={`Actions for ${d.title}`}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <MoreVertical />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={() => onOpen(d)}
                                        >
                                            Open
                                        </DropdownMenuItem>
                                        {localCopy(d.id) ? (
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setConfirm({
                                                        kind: 'latest',
                                                        diagram: d,
                                                    })
                                                }
                                            >
                                                Get latest from server
                                            </DropdownMenuItem>
                                        ) : null}
                                        {d.role === 'owner' ? (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() =>
                                                        setConfirm({
                                                            kind: 'delete',
                                                            diagram: d,
                                                        })
                                                    }
                                                >
                                                    Delete for everyone
                                                </DropdownMenuItem>
                                            </>
                                        ) : null}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <AlertDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && !busy && setConfirm(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirm?.kind === 'delete'
                                ? 'Delete this diagram?'
                                : 'Discard your local copy?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm?.kind === 'delete'
                                ? `"${confirm.diagram.title}" will be deleted for everyone in the project. This cannot be undone.`
                                : `Changes to "${confirm?.diagram.title}" that were not saved to the project are lost, and the latest version is downloaded.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                // keep the dialog up while the request runs
                                e.preventDefault();
                                if (!confirm) return;
                                if (confirm.kind === 'delete') {
                                    void remove(confirm.diagram);
                                } else {
                                    void getLatest(confirm.diagram);
                                }
                            }}
                        >
                            {confirm?.kind === 'delete'
                                ? 'Delete for everyone'
                                : 'Get latest'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
