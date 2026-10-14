import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, ApiError } from '@/lib/qubdi/api';
import { setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import {
    AUTOSAVE_DELAY_MS,
    createAutosaver,
    type Autosaver,
} from '@/lib/qubdi/autosave';
import type { Diagram } from '@/lib/domain/diagram';
import { createRevisionTracker } from '@/lib/qubdi/revision';
import {
    resetSaveStatus,
    setSaveStatus,
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
                setSaveStatus(status, retry, overwrite);
            },
        });
        saverRef.current = saver;
        const flushOnLeave = () => {
            leavingRef.current = true;
            void saver.flush();
        };
        // the page may come back from the back/forward cache
        const resumed = () => {
            leavingRef.current = false;
        };
        window.addEventListener('pagehide', flushOnLeave);
        window.addEventListener('pageshow', resumed);
        return () => {
            window.removeEventListener('pagehide', flushOnLeave);
            window.removeEventListener('pageshow', resumed);
            // leaving the diagram: send what is still pending
            void saver.flush().finally(() => saver.dispose());
            saverRef.current = null;
            resetSaveStatus();
        };
    }, [canSave, diagramId]);

    useEffect(() => {
        // ignore the empty placeholder shown while another diagram is loading
        if (saverRef.current && currentDiagram.id === diagramId) {
            saverRef.current.update({
                diagram: currentDiagram,
                revision: revisionOf(currentDiagram),
            });
        }
    }, [currentDiagram, diagramId, revisionOf]);

    return null;
};

/** Small "Saved / Saving / Not saved" indicator for the navbar. */
export const ServerSaveStatus: React.FC = () => {
    const { enabled } = useQubdi();
    const { access } = useDiagramAccess();
    const { status, retry, overwrite } = useSaveStatus();

    if (!enabled || access.status !== 'editor' || status === 'idle') {
        return null;
    }

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
            <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                Not saved
                {retry ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={retry}
                    >
                        Retry
                    </Button>
                ) : null}
            </span>
        );
    }

    if (status === 'pending') {
        return (
            <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                role="status"
            >
                <span className="size-2 rounded-full bg-amber-500" />
                Unsaved changes
                {retry ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={retry}
                    >
                        Save now
                    </Button>
                ) : null}
            </span>
        );
    }

    return (
        <span
            className="flex items-center gap-1 text-xs text-muted-foreground"
            role="status"
        >
            {status === 'saving' ? (
                <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving…
                </>
            ) : (
                <>
                    <Check className="size-3.5 text-primary" />
                    Saved to project
                </>
            )}
        </span>
    );
};
