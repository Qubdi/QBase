import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { isLocked, lockedReason } from '@/lib/qubdi/access';
import { api, errorMessage, type MyProject } from '@/lib/qubdi/api';
import { useDiagramAccess } from './diagram-access-context';

/** Explains why the open diagram is read-only and, if it can, how to fix it. */
export const AccessBanner: React.FC = () => {
    const { access, refresh } = useDiagramAccess();
    const { syncDiagram } = useQubdi();
    const { currentDiagram } = useDiagram();
    const [projects, setProjects] = useState<MyProject[]>([]);
    const [choice, setChoice] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const unbound = access.status === 'unbound';
    const projectId =
        access.status === 'viewer' || access.status === 'editor'
            ? access.projectId
            : undefined;

    useEffect(() => {
        if (!unbound && !projectId) return;
        api.listProjects({ limit: 100 })
            .then((page) => setProjects(page.items))
            .catch(() => setProjects([]));
    }, [unbound, projectId]);

    if (!isLocked(access)) return null;

    const writable = projects.filter((p) => p.role !== 'viewer');
    const reason = lockedReason(
        access,
        projects.find((p) => p.id === projectId)?.name
    );

    if (!reason) return null;

    const move = async () => {
        if (!choice) return;
        setBusy(true);
        setError(null);
        try {
            await syncDiagram(currentDiagram, choice);
            refresh();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-accent px-4 py-2 text-sm text-accent-foreground"
        >
            <Lock className="size-4 shrink-0" />
            <span className="flex-1">{reason}</span>
            {unbound && writable.length > 0 ? (
                <span className="flex items-center gap-2">
                    <OptionSelect
                        size="sm"
                        className="w-56"
                        aria-label="Project to move this diagram into"
                        placeholder="Choose a project…"
                        value={choice}
                        onValueChange={setChoice}
                        options={writable.map((p) => ({
                            value: p.id,
                            label: p.name,
                        }))}
                    />
                    <Button
                        size="sm"
                        disabled={!choice || busy}
                        onClick={() => void move()}
                    >
                        Move into project
                    </Button>
                </span>
            ) : null}
            {unbound && writable.length === 0 && projects.length === 0 ? (
                <span className="text-muted-foreground">
                    Ask an admin to add you to a project.
                </span>
            ) : null}
            {error ? (
                <span role="alert" className="text-destructive">
                    {error}
                </span>
            ) : null}
        </div>
    );
};
