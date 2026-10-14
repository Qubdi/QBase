import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useChartDB } from '@/hooks/use-chartdb';
import { useQubdi } from '@/hooks/use-qubdi';
import { createAutosaver, type Autosaver } from '@/lib/qubdi/autosave';
import type { Diagram } from '@/lib/domain/diagram';
import {
    resetSaveStatus,
    setSaveStatus,
    useSaveStatus,
} from '@/lib/qubdi/save-status-store';
import { useDiagramAccess } from './diagram-access-context';

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Saves the open diagram to its project on the server as it changes. Renders
 * nothing; the navbar shows the result through <ServerSaveStatus />.
 */
export const ServerAutosave: React.FC = () => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const { access } = useDiagramAccess();
    const { syncDiagram } = useQubdi();
    const { currentDiagram } = useChartDB();
    const saverRef = useRef<Autosaver<Diagram> | null>(null);
    const syncRef = useRef(syncDiagram);
    syncRef.current = syncDiagram;

    const canSave = access.status === 'editor' && !!diagramId;

    useEffect(() => {
        if (!canSave) return;
        const saver = createAutosaver<Diagram>({
            delayMs: AUTOSAVE_DELAY_MS,
            serialize: (d) => JSON.stringify(d),
            save: async (d) => {
                await syncRef.current(d);
            },
            onStatus: (status) =>
                setSaveStatus(status, () => void saver.flush()),
        });
        saverRef.current = saver;
        const flushOnLeave = () => void saver.flush();
        window.addEventListener('pagehide', flushOnLeave);
        return () => {
            window.removeEventListener('pagehide', flushOnLeave);
            // leaving the diagram: send what is still pending
            void saver.flush().finally(() => saver.dispose());
            saverRef.current = null;
            resetSaveStatus();
        };
    }, [canSave, diagramId]);

    useEffect(() => {
        // ignore the empty placeholder shown while another diagram is loading
        if (saverRef.current && currentDiagram.id === diagramId) {
            saverRef.current.update(currentDiagram);
        }
    }, [currentDiagram, diagramId]);

    return null;
};

/** Small "Saved / Saving / Not saved" indicator for the navbar. */
export const ServerSaveStatus: React.FC = () => {
    const { enabled } = useQubdi();
    const { access } = useDiagramAccess();
    const { status, retry } = useSaveStatus();

    if (!enabled || access.status !== 'editor' || status === 'idle') {
        return null;
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
