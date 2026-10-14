import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import { useStorage } from '@/hooks/use-storage';
import { api, errorMessage, type RemoteDiagramSummary } from '@/lib/qubdi/api';
import { serverContentToDiagram } from '@/lib/qubdi/open-remote';
import {
    clearRemoteId,
    findLocalId,
    setProjectId,
    setRemoteId,
} from '@/lib/qubdi/remote-map';
import { generateId } from '@/lib/utils';

export interface ProjectDiagramsProps {
    diagrams: RemoteDiagramSummary[];
    /** Called after a diagram was deleted so the page can reload its list. */
    onChanged?: () => void;
}

const roleLabel = (role: RemoteDiagramSummary['role']) =>
    role === 'owner' ? 'Admin' : role === 'editor' ? 'Editor' : 'Viewer';

/** The diagrams of one project, with a way to open each in the editor. */
export const ProjectDiagrams: React.FC<ProjectDiagramsProps> = ({
    diagrams,
    onChanged,
}) => {
    const { addDiagram, deleteDiagram, listDiagrams } = useStorage();
    const navigate = useNavigate();
    const [localIds, setLocalIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    const download = async (
        d: RemoteDiagramSummary,
        localId: string,
        replace: boolean
    ) => {
        const remote = await api.getDiagram(d.id);
        if (!remote.content) {
            throw new Error(
                'This diagram has not been published yet. Ask an editor to publish it.'
            );
        }
        const diagram = serverContentToDiagram(remote.content, {
            localId,
            name: remote.title,
        });
        if (replace) await deleteDiagram(localId);
        await addDiagram({ diagram });
        setRemoteId(localId, d.id);
        if (d.projectId) setProjectId(localId, d.projectId);
        return diagram.id;
    };

    const fail = (e: unknown) =>
        setError(
            e instanceof Error && !('code' in e) ? e.message : errorMessage(e)
        );

    const open = async (d: RemoteDiagramSummary) => {
        setError(null);
        const existing = localCopy(d.id);
        if (existing) {
            navigate(`/diagrams/${existing}`);
            return;
        }
        setBusyId(d.id);
        try {
            navigate(`/diagrams/${await download(d, generateId(), false)}`);
        } catch (e) {
            fail(e);
        } finally {
            setBusyId(null);
        }
    };

    const getLatest = async (d: RemoteDiagramSummary) => {
        const existing = localCopy(d.id);
        if (!existing) return;
        setError(null);
        setBusyId(d.id);
        try {
            await download(d, existing, true);
            // the editor caches the open diagram, so load it fresh from storage
            window.location.assign(`/diagrams/${existing}`);
        } catch (e) {
            fail(e);
        } finally {
            setBusyId(null);
            setConfirmId(null);
        }
    };

    // only admins (role 'owner') may delete; the server enforces it too
    const remove = async (d: RemoteDiagramSummary) => {
        setError(null);
        setBusyId(d.id);
        try {
            await api.deleteDiagram(d.id);
            const local = findLocalId(d.id);
            if (local) {
                await deleteDiagram(local).catch(() => undefined);
                clearRemoteId(local);
            }
            onChanged?.();
        } catch (e) {
            fail(e);
        } finally {
            setBusyId(null);
            setConfirmDeleteId(null);
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
            <ul
                className="divide-y rounded-xl border bg-card shadow-sm"
                aria-label="Diagrams"
            >
                {diagrams.map((d) => {
                    const hasLocal = !!localCopy(d.id);
                    const busy = busyId === d.id;
                    return (
                        <li
                            key={d.id}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-medium">
                                        {d.title}
                                    </span>
                                    <Badge variant="secondary">
                                        {roleLabel(d.role)}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Updated{' '}
                                    {new Date(d.updatedAt).toLocaleString()}
                                    {hasLocal ? ' · saved in this browser' : ''}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {hasLocal ? (
                                    confirmId === d.id ? (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={busy}
                                            onClick={() => void getLatest(d)}
                                        >
                                            Discard local changes
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy}
                                            onClick={() => setConfirmId(d.id)}
                                        >
                                            Get latest
                                        </Button>
                                    )
                                ) : null}
                                {d.role === 'owner' ? (
                                    confirmDeleteId === d.id ? (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={busy}
                                            onClick={() => void remove(d)}
                                        >
                                            Delete for everyone
                                        </Button>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive"
                                            disabled={busy}
                                            onClick={() =>
                                                setConfirmDeleteId(d.id)
                                            }
                                        >
                                            Delete
                                        </Button>
                                    )
                                ) : null}
                                <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => void open(d)}
                                >
                                    {busy ? 'Opening…' : 'Open'}
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
