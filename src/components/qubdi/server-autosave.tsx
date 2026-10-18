import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CloudCheck, CloudUpload, Loader2 } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, ApiError } from '@/lib/qubdi/api';
import { reportLockLost } from '@/lib/qubdi/lock-lost';
import { isLastSentContent, sameContent } from '@/lib/qubdi/sent-content';
import { diagramToServerContent } from '@/lib/qubdi/content';
import { getBaseUpdatedAt, setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import {
    AUTOSAVE_DELAY_MS,
    createAutosaver,
    type Autosaver,
} from '@/lib/qubdi/autosave';
import type { Diagram } from '@/lib/domain/diagram';
import { createRevisionTracker } from '@/lib/qubdi/revision';
import {
    registerFinalFlush,
    registerSaveDiscard,
    resetSaveStatus,
    setSaveStatus,
    trackFinalSave,
    useSaveStatus,
} from '@/lib/qubdi/save-status-store';
import { useDiagramAccess } from './diagram-access-context';
import { useEditorDiagramId } from './workspace-context';

interface Revision {
    diagram: Diagram;
    revision: number;
}

/**
 * Saves the open diagram to its project on the server as it changes. Renders
 * nothing; the navbar shows the result through <ServerSaveStatus />.
 */
export const ServerAutosave: React.FC = () => {
    const diagramId = useEditorDiagramId();
    const { access } = useDiagramAccess();
    const { syncDiagram } = useQubdi();
    const { currentDiagram } = useDiagram();
    const saverRef = useRef<Autosaver<Revision> | null>(null);
    const revisionOf = useRef(createRevisionTracker()).current;
    const syncRef = useRef(syncDiagram);
    syncRef.current = syncDiagram;
    // the saver outlives renders: it reads the latest access from here
    const accessRef = useRef(access);
    accessRef.current = access;
    // set while the page is closing, so the final save survives the unload
    const leavingRef = useRef(false);
    // the newest diagram the editor reported, for the check on open
    const latestRef = useRef<Diagram | null>(null);

    const canSave = access.status === 'editor' && !!diagramId;

    useEffect(() => {
        if (!canSave) return;
        const saver = createAutosaver<Revision>({
            delayMs: AUTOSAVE_DELAY_MS,
            // a revision number, so no change has to serialise the diagram
            serialize: (v) => String(v.revision),
            save: async ({ diagram }) => {
                await syncRef.current(diagram, undefined, {
                    keepalive: leavingRef.current,
                });
            },
            onStatus: (status, error) => {
                const retry = () => void saver.flush();
                const current = accessRef.current;
                // the lock went to someone else: go read-only, do not retry
                if (
                    error instanceof ApiError &&
                    error.status === 423 &&
                    current.status === 'editor'
                ) {
                    reportLockLost(current.remoteId);
                    return;
                }
                const conflict =
                    error instanceof ApiError &&
                    error.status === 409 &&
                    current.status === 'editor';
                // "Overwrite": take the server's current version as the base,
                // so the next save goes on top of it
                const overwrite =
                    conflict && current.status === 'editor'
                        ? () =>
                              void api
                                  .getDiagram(current.remoteId)
                                  .then((d) => {
                                      setBaseUpdatedAt(diagramId, d.updatedAt);
                                      return saver.flush();
                                  })
                                  .catch(() => undefined)
                        : null;
                if (conflict && current.status === 'editor') {
                    // a save of ours that landed without its reply is not a
                    // conflict: take the server's version and save again
                    void api
                        .getDiagram(current.remoteId)
                        .then((d) => {
                            if (!isLastSentContent(diagramId, d.content)) {
                                throw new Error('changed by someone else');
                            }
                            setBaseUpdatedAt(diagramId, d.updatedAt);
                            return saver.flush();
                        })
                        .catch(() => setSaveStatus(status, retry, overwrite));
                    return;
                }
                setSaveStatus(status, retry, overwrite);
            },
        });
        saverRef.current = saver;
        // Edits made before a reload, re-login or reopen may never have been
        // sent. If the server still holds the version this copy was based on
        // but its content differs from ours, the difference is unsent work.
        const opened = accessRef.current;
        let checked = false;
        if (opened.status === 'editor') {
            void api
                .getDiagram(opened.remoteId)
                .then((remote) => {
                    const local = latestRef.current;
                    if (
                        checked ||
                        !local ||
                        !remote.content ||
                        remote.updatedAt !== getBaseUpdatedAt(diagramId) ||
                        sameContent(
                            remote.content,
                            diagramToServerContent(local)
                        )
                    )
                        return;
                    saver.markUnsaved();
                })
                .catch(() => undefined);
        }
        registerSaveDiscard(() => saver.discard());
        const flushOnLeave = () => {
            leavingRef.current = true;
            const sent = saver.flush();
            trackFinalSave(sent);
            return sent;
        };
        registerFinalFlush(flushOnLeave);
        // the page may come back from the back/forward cache
        const resumed = () => {
            leavingRef.current = false;
            registerFinalFlush(flushOnLeave);
        };
        window.addEventListener('pagehide', flushOnLeave);
        window.addEventListener('pageshow', resumed);
        return () => {
            checked = true;
            window.removeEventListener('pagehide', flushOnLeave);
            window.removeEventListener('pageshow', resumed);
            // leaving the diagram: send what is still pending
            const sent = saver.flush();
            trackFinalSave(sent);
            void sent.finally(() => saver.dispose());
            saverRef.current = null;
            registerFinalFlush(null);
            registerSaveDiscard(null);
            resetSaveStatus();
        };
    }, [canSave, diagramId]);

    useEffect(() => {
        // ignore the empty placeholder shown while another diagram is loading
        if (saverRef.current && currentDiagram.id === diagramId) {
            latestRef.current = currentDiagram;
            saverRef.current.update({
                diagram: currentDiagram,
                revision: revisionOf(currentDiagram),
            });
        }
    }, [currentDiagram, diagramId, revisionOf]);

    return null;
};

interface StatusIconProps {
    /** the accessible name; also the tooltip */
    label: string;
    /** makes the icon a button */
    onClick?: (() => void) | null;
    className?: string;
    children: React.ReactNode;
}

/** One navbar-sized icon with its label; a button only when it can act. */
const StatusIcon: React.FC<StatusIconProps> = ({
    label,
    onClick,
    className,
    children,
}) =>
    onClick ? (
        <Button
            variant="ghost"
            size="icon"
            className={`relative size-8 ${className ?? ''}`}
            aria-label={label}
            title={label}
            onClick={onClick}
        >
            {children}
        </Button>
    ) : (
        <span
            role="status"
            aria-label={label}
            title={label}
            tabIndex={0}
            className={`flex size-8 items-center justify-center rounded-md text-muted-foreground [&_svg]:size-4 ${className ?? ''}`}
        >
            {children}
        </span>
    );

/**
 * The save state of the open diagram as one icon in the navbar; the tooltip
 * says what it means. `fallback` shows while there is nothing to report (or
 * without a server).
 */
export const ServerSaveStatus: React.FC<{ fallback?: React.ReactNode }> = ({
    fallback = null,
}) => {
    const { enabled } = useQubdi();
    const { access } = useDiagramAccess();
    const { status, retry, overwrite } = useSaveStatus();

    if (!enabled || access.status !== 'editor' || status === 'idle') {
        return <>{fallback}</>;
    }

    // the one state that needs words: the user has to choose
    if (status === 'error' && overwrite) {
        return (
            <span
                className="flex items-center gap-1 text-xs text-destructive"
                role="alert"
            >
                <AlertTriangle className="size-3.5" />
                Someone else saved a newer version
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={overwrite}
                >
                    Overwrite with mine
                </Button>
            </span>
        );
    }

    if (status === 'error') {
        return (
            <StatusIcon
                label={retry ? 'Not saved. Click to try again' : 'Not saved'}
                onClick={retry}
                className="text-destructive hover:text-destructive"
            >
                <AlertTriangle />
            </StatusIcon>
        );
    }

    if (status === 'pending') {
        return (
            <StatusIcon
                label={
                    retry
                        ? 'Unsaved changes. Click to save now'
                        : 'Unsaved changes'
                }
                onClick={retry}
            >
                <CloudUpload />
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500" />
            </StatusIcon>
        );
    }

    if (status === 'saving') {
        return (
            <StatusIcon label="Saving…">
                <Loader2 className="animate-spin" />
            </StatusIcon>
        );
    }

    return (
        <StatusIcon label="Saved to project">
            <CloudCheck className="text-primary" />
        </StatusIcon>
    );
};
