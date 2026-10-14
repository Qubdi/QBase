import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/badge/badge';
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
import { useStorage } from '@/hooks/use-storage';
import { api, errorMessage, type RemoteDiagramSummary } from '@/lib/qubdi/api';
import {
    filterGroups,
    groupByProject,
    serverContentToDiagram,
    type DiagramGroup,
} from '@/lib/qubdi/open-remote';
import { findLocalId, setRemoteId } from '@/lib/qubdi/remote-map';
import { generateId } from '@/lib/utils';

export interface OpenFromServerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const roleLabel = (role: RemoteDiagramSummary['role']) =>
    role === 'owner' ? 'Admin' : role === 'editor' ? 'Editor' : 'Viewer';

export const OpenFromServerDialog: React.FC<OpenFromServerDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { addDiagram, deleteDiagram, listDiagrams } = useStorage();
    const navigate = useNavigate();
    const [groups, setGroups] = useState<DiagramGroup[] | null>(null);
    const [localIds, setLocalIds] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmReplaceId, setConfirmReplaceId] = useState<string | null>(
        null
    );

    const load = useCallback(async () => {
        setError(null);
        try {
            const [diagrams, projects, local] = await Promise.all([
                api.listDiagrams(),
                api.listProjects(),
                listDiagrams(),
            ]);
            setGroups(groupByProject(diagrams, projects));
            setLocalIds(new Set(local.map((d) => d.id)));
        } catch (e) {
            setError(errorMessage(e));
            setGroups([]);
        }
    }, [listDiagrams]);

    useEffect(() => {
        if (!open) return;
        setGroups(null);
        setQuery('');
        setConfirmReplaceId(null);
        void load();
    }, [open, load]);

    const visible = useMemo(
        () => (groups ? filterGroups(groups, query) : null),
        [groups, query]
    );

    /** The local copy of a server diagram, when it still exists in this browser. */
    const localCopy = (remoteId: string) => {
        const id = findLocalId(remoteId);
        return id && localIds.has(id) ? id : undefined;
    };

    const download = async (
        remoteId: string,
        localId: string,
        isReplace: boolean
    ) => {
        const remote = await api.getDiagram(remoteId);
        if (!remote.content) {
            throw new Error(
                'This diagram has not been published yet. Ask an editor to publish it.'
            );
        }
        const diagram = serverContentToDiagram(remote.content, {
            localId,
            name: remote.title,
        });
        if (isReplace) await deleteDiagram(localId);
        await addDiagram({ diagram });
        setRemoteId(localId, remoteId);
        return diagram.id;
    };

    const openDiagram = async (d: RemoteDiagramSummary) => {
        setError(null);
        const existing = localCopy(d.id);
        if (existing) {
            onOpenChange(false);
            navigate(`/diagrams/${existing}`);
            return;
        }
        setBusyId(d.id);
        try {
            const localId = await download(d.id, generateId(), false);
            onOpenChange(false);
            navigate(`/diagrams/${localId}`);
        } catch (e) {
            setError(
                e instanceof Error && !('code' in e)
                    ? e.message
                    : errorMessage(e)
            );
        } finally {
            setBusyId(null);
        }
    };

    const replaceLocal = async (d: RemoteDiagramSummary) => {
        const existing = localCopy(d.id);
        if (!existing) return;
        setError(null);
        setBusyId(d.id);
        try {
            await download(d.id, existing, true);
            onOpenChange(false);
            // the editor caches the open diagram, so reload it from storage
            window.location.assign(`/diagrams/${existing}`);
        } catch (e) {
            setError(
                e instanceof Error && !('code' in e)
                    ? e.message
                    : errorMessage(e)
            );
        } finally {
            setBusyId(null);
            setConfirmReplaceId(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl" showClose>
                <DialogHeader>
                    <DialogTitle>Open from server</DialogTitle>
                    <DialogDescription>
                        Diagrams in the projects you are assigned to, plus your
                        personal ones.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    placeholder="Search diagrams…"
                    aria-label="Search diagrams"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <div
                    className="flex max-h-[50vh] flex-col gap-5 overflow-y-auto pr-1"
                    data-testid="server-diagrams"
                >
                    {visible === null ? (
                        <Spinner className="mx-auto text-primary" />
                    ) : visible.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {query
                                ? 'No diagrams match your search.'
                                : 'Nothing here yet. Ask an admin to add you to a project, or sync a diagram to the server.'}
                        </p>
                    ) : (
                        visible.map((g) => (
                            <section
                                key={g.projectId ?? 'personal'}
                                aria-label={g.label}
                            >
                                <h3 className="font-primary text-sm font-semibold">
                                    {g.label}
                                </h3>
                                {g.description ? (
                                    <p className="text-xs text-muted-foreground">
                                        {g.description}
                                    </p>
                                ) : null}
                                {g.diagrams.length === 0 ? (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        No diagrams in this project yet.
                                    </p>
                                ) : (
                                    <ul className="mt-1 divide-y rounded-lg border">
                                        {g.diagrams.map((d) => {
                                            const hasLocal = !!localCopy(d.id);
                                            const busy = busyId === d.id;
                                            return (
                                                <li
                                                    key={d.id}
                                                    className="flex items-center justify-between gap-3 px-3 py-2"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate text-sm font-medium">
                                                                {d.title}
                                                            </span>
                                                            <Badge variant="secondary">
                                                                {roleLabel(
                                                                    d.role
                                                                )}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            Updated{' '}
                                                            {new Date(
                                                                d.updatedAt
                                                            ).toLocaleString()}
                                                            {hasLocal
                                                                ? ' · saved in this browser'
                                                                : ''}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {hasLocal ? (
                                                            confirmReplaceId ===
                                                            d.id ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onClick={() =>
                                                                        replaceLocal(
                                                                            d
                                                                        )
                                                                    }
                                                                >
                                                                    Discard
                                                                    local
                                                                    changes
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    disabled={
                                                                        busy
                                                                    }
                                                                    onClick={() =>
                                                                        setConfirmReplaceId(
                                                                            d.id
                                                                        )
                                                                    }
                                                                >
                                                                    Get latest
                                                                </Button>
                                                            )
                                                        ) : null}
                                                        <Button
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                openDiagram(d)
                                                            }
                                                        >
                                                            {busy
                                                                ? 'Opening…'
                                                                : 'Open'}
                                                        </Button>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
