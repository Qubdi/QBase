import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/button/button';
import { Logo } from '@/components/logo/logo';
import { Spinner } from '@/components/spinner/spinner';
import { DiagramProvider } from '@/context/diagram-context/diagram-provider';
import { useQubdi } from '@/hooks/use-qubdi';
import { useStorage } from '@/hooks/use-storage';
import {
    applyLock,
    isLocked,
    resolveAccess,
    type AccessState,
} from '@/lib/qubdi/access';
import { api, ApiError, errorMessage } from '@/lib/qubdi/api';
import {
    ensureLocalCopy,
    UnpublishedDiagramError,
} from '@/lib/qubdi/open-remote';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import {
    getProjectId,
    getRemoteId,
    setProjectId,
} from '@/lib/qubdi/remote-map';
import { generateId } from '@/lib/utils';
import { SessionEndedNotice } from './session-ended-notice';
import { SignInPrompt } from './sign-in-prompt';
import { useEditLock } from './use-edit-lock';
import {
    DiagramAccessContext,
    type DiagramAccessValue,
} from './diagram-access-context';
import { WorkspaceContext, type Workspace } from './workspace-context';

const Centered: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        {children}
    </div>
);

const Loading: React.FC = () => (
    <Centered>
        <Spinner size="large" className="text-primary" />
    </Centered>
);

const SignInRequired: React.FC = () => (
    <Centered>
        <Logo className="h-auto" />
        <SessionEndedNotice />
        <SignInPrompt verb="open" />
    </Centered>
);

const Problem: React.FC<{ title: string; detail: string }> = ({
    title,
    detail,
}) => (
    <Centered>
        <Logo className="h-auto" />
        <div>
            <p className="font-medium">{title}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {detail}
            </p>
        </div>
        <Button asChild variant="outline">
            <Link to="/">Back to projects</Link>
        </Button>
    </Centered>
);

// --- project workspace: /<project>/diagrams[/<server diagram id>] ---------

type Resolution =
    | { kind: 'loading' }
    | { kind: 'project_missing' }
    | { kind: 'diagram_missing' }
    | { kind: 'failed'; message: string }
    | { kind: 'ready'; workspace: Workspace; access: AccessState };

/**
 * Works out the project from the URL, checks the diagram belongs to it, and
 * makes sure this browser has a copy to edit. Another project's diagram is
 * treated as missing, never shown.
 */
function useWorkspaceResolution(
    slug: string | undefined,
    remoteDiagramId: string | undefined
): Resolution {
    const { user } = useQubdi();
    const { listDiagrams, addDiagram } = useStorage();
    const [state, setState] = useState<Resolution>({ kind: 'loading' });

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const done = (next: Resolution) => !cancelled && setState(next);
        setState({ kind: 'loading' });

        (async () => {
            // the server answers 404 for a project that is missing or not the user's
            const project = slug
                ? await api.getProject(slug).catch((e: unknown) => {
                      if (e instanceof ApiError && e.status === 404)
                          return null;
                      throw e;
                  })
                : null;
            if (!project) return done({ kind: 'project_missing' });

            if (!remoteDiagramId) {
                return done({
                    kind: 'ready',
                    workspace: {
                        project,
                        localDiagramId: undefined,
                        remoteDiagramId: undefined,
                    },
                    access: { status: 'no_diagram', projectId: project.id },
                });
            }

            const diagrams = await api.listDiagrams();
            const found = diagrams.find(
                (d) => d.id === remoteDiagramId && d.projectId === project.id
            );
            if (!found) return done({ kind: 'diagram_missing' });

            const local = await listDiagrams();
            const { localId } = await ensureLocalCopy({
                remoteId: remoteDiagramId,
                projectId: project.id,
                localIds: new Set(local.map((d) => d.id)),
                fetchRemote: (id) => api.getDiagram(id),
                addDiagram: (diagram) => addDiagram({ diagram }),
                newId: generateId,
            });
            done({
                kind: 'ready',
                workspace: {
                    project,
                    localDiagramId: localId,
                    remoteDiagramId,
                },
                access: resolveAccess(remoteDiagramId, diagrams),
            });
        })().catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 404) {
                return done({ kind: 'diagram_missing' });
            }
            done({
                kind: 'failed',
                message:
                    e instanceof UnpublishedDiagramError
                        ? e.message
                        : errorMessage(e),
            });
        });

        return () => {
            cancelled = true;
        };
        // listDiagrams/addDiagram are stable storage calls
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, slug, remoteDiagramId]);

    return state;
}

const WorkspaceGate: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { projectSlug, remoteDiagramId } = useParams<{
        projectSlug: string;
        remoteDiagramId: string;
    }>();
    const { user } = useQubdi();
    const resolution = useWorkspaceResolution(projectSlug, remoteDiagramId);
    const navigate = useNavigate();
    const refresh = useCallback(() => navigate(0), [navigate]);
    const granted = resolution.kind === 'ready' ? resolution.access : null;
    // only one editor at a time: an editor edits only while holding the lock
    const lock = useEditLock(
        user && granted?.status === 'editor' ? granted.remoteId : undefined
    );
    const value = useMemo<DiagramAccessValue | null>(() => {
        const access = granted ? applyLock(granted, lock) : null;
        return access ? { access, refresh } : null;
    }, [granted, lock, refresh]);

    if (user === undefined) return <Loading />;
    if (user === null) return <SignInRequired />;

    switch (resolution.kind) {
        case 'loading':
            return <Loading />;
        case 'project_missing':
            return (
                <Problem
                    title="Project not found"
                    detail="It does not exist, or you have not been added to it."
                />
            );
        case 'diagram_missing':
            return (
                <Problem
                    title="Diagram not found"
                    detail="It is not in this project, or you do not have access to it."
                />
            );
        case 'failed':
            return (
                <Problem
                    title="Could not open this diagram"
                    detail={resolution.message}
                />
            );
    }

    // the edit lock is still being asked for
    if (!value) return <Loading />;

    return (
        <WorkspaceContext.Provider value={resolution.workspace}>
            <DiagramAccessContext.Provider value={value}>
                <DiagramProvider readonly={isLocked(value.access) || undefined}>
                    {children}
                </DiagramProvider>
            </DiagramAccessContext.Provider>
        </WorkspaceContext.Provider>
    );
};

// --- old /diagrams/<local id> links -----------------------------------------

/** Asks the server what the signed-in user may do with a local diagram. */
function useLegacyAccess(localId: string | undefined): DiagramAccessValue {
    const { user } = useQubdi();
    const [access, setAccess] = useState<AccessState>({ status: 'loading' });
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        if (user === undefined) {
            setAccess({ status: 'loading' });
            return;
        }
        if (user === null) {
            setAccess({ status: 'signed_out' });
            return;
        }
        const remoteId = localId ? getRemoteId(localId) : undefined;
        if (!remoteId) {
            setAccess({ status: 'unbound' });
            return;
        }
        let cancelled = false;
        setAccess({ status: 'loading' });
        api.listDiagrams()
            .then((list) => {
                if (cancelled) return;
                const next = resolveAccess(remoteId, list);
                if (next.status === 'editor' || next.status === 'viewer') {
                    if (localId && getProjectId(localId) !== next.projectId) {
                        setProjectId(localId, next.projectId);
                    }
                }
                setAccess(next);
            })
            .catch(() => !cancelled && setAccess({ status: 'error' }));
        return () => {
            cancelled = true;
        };
    }, [user, localId, tick]);

    return useMemo(() => ({ access, refresh }), [access, refresh]);
}

/**
 * Old bookmarks point at /diagrams/<local id>. A diagram that is in a project
 * moves to its project URL; one that is not stays read-only here so it can be
 * moved into a project from the banner.
 */
const LegacyGate: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const value = useLegacyAccess(diagramId);
    const { status } = value.access;
    const [target, setTarget] = useState<string | null>(null);
    const [lookedUp, setLookedUp] = useState(false);

    const inProject =
        value.access.status === 'editor' || value.access.status === 'viewer';
    const projectId = inProject
        ? (value.access as { projectId: string }).projectId
        : undefined;
    const remoteId = diagramId ? getRemoteId(diagramId) : undefined;

    useEffect(() => {
        if (!projectId || !remoteId) return;
        let cancelled = false;
        api.getProject(projectId)
            .then((p) => {
                if (!cancelled) {
                    setTarget(projectDiagramPath(p.slug, remoteId));
                }
            })
            .catch(() => undefined)
            .finally(() => !cancelled && setLookedUp(true));
        return () => {
            cancelled = true;
        };
    }, [projectId, remoteId]);

    if (status === 'loading') return <Loading />;
    if (status === 'signed_out') return <SignInRequired />;
    if (inProject && !lookedUp) return <Loading />;
    if (target) return <Navigate to={target} replace />;

    return (
        <DiagramAccessContext.Provider value={value}>
            <DiagramProvider readonly={isLocked(value.access) || undefined}>
                {children}
            </DiagramProvider>
        </DiagramAccessContext.Provider>
    );
};

/**
 * Wraps the editor's data layer. With a backend, the editor needs a signed-in
 * user, and a diagram is editable only through a project role; every other
 * case opens read-only (the editor stops changing or storing anything).
 */
export const DiagramAccessGate: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { enabled } = useQubdi();
    const { projectSlug } = useParams<{ projectSlug: string }>();

    if (!enabled) return <DiagramProvider>{children}</DiagramProvider>;
    if (projectSlug) return <WorkspaceGate>{children}</WorkspaceGate>;
    return <LegacyGate>{children}</LegacyGate>;
};
