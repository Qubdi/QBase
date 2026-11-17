import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { useDiagram } from '@/qbase/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { isLocked, lockedReason } from '@/lib/qubdi/access';
import { api, errorMessage, type MyProject } from '@/lib/qubdi/api';
import { fetchAllPages } from '@/lib/qubdi/paging';
import { useDiagramAccess } from './diagram-access-context';
import { TakenBanner } from './taken-banner';

/** Explains why the open diagram is read-only and, if it can, how to fix it. */
export const AccessBanner: React.FC = () => {
    const { t } = useTranslation();
    const { access, refresh } = useDiagramAccess();
    const { syncDiagram, user } = useQubdi();
    const { currentDiagram } = useDiagram();
    const [projects, setProjects] = useState<MyProject[]>([]);
    const [projectName, setProjectName] = useState<string | undefined>();
    const [choice, setChoice] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const unbound = access.status === 'unbound';
    const projectId =
        access.status === 'viewer' || access.status === 'editor'
            ? access.projectId
            : undefined;

    // the projects to choose from when moving a diagram into one
    useEffect(() => {
        if (!unbound) return;
        fetchAllPages((page) => api.listProjects({ limit: 100, page }))
            .then(setProjects)
            .catch(() => setProjects([]));
    }, [unbound]);

    // no project: no name to show. Reset while rendering, when the id changes
    // to none, not in an effect.
    const [seenProjectId, setSeenProjectId] = useState(projectId);
    if (seenProjectId !== projectId) {
        setSeenProjectId(projectId);
        if (!projectId) setProjectName(undefined);
    }

    // the diagram's own project, by id: it may be beyond the first page of projects
    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        api.getProject(projectId)
            .then((project) => !cancelled && setProjectName(project.name))
            .catch(() => !cancelled && setProjectName(undefined));
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    if (!isLocked(access)) return null;

    const writable = projects.filter((p) => p.role !== 'viewer');
    const reason = lockedReason(access, projectName, user?.email);

    if (!reason) return null;

    // someone else is editing: the one case that has to be hard to miss
    if (access.status === 'taken') {
        return (
            <TakenBanner
                remoteId={access.remoteId}
                reason={reason}
                holder={access.holder}
                ownTab={access.holder !== null && access.holder === user?.email}
            />
        );
    }

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
            {access.status === 'error' ? (
                // the server could not be asked (the lock, the diagram list): ask again
                <Button size="sm" onClick={refresh}>
                    {t('qubdi.workspace.accessBanner.retry')}
                </Button>
            ) : null}
            {unbound && writable.length > 0 ? (
                <span className="flex items-center gap-2">
                    <OptionSelect
                        size="sm"
                        className="w-56"
                        aria-label={t('qubdi.workspace.accessBanner.moveAria')}
                        placeholder={t(
                            'qubdi.workspace.accessBanner.choosePlaceholder'
                        )}
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
                        {t('qubdi.workspace.accessBanner.move')}
                    </Button>
                </span>
            ) : null}
            {unbound && writable.length === 0 && projects.length === 0 ? (
                <span className="text-muted-foreground">
                    {t('qubdi.workspace.accessBanner.askAdmin')}
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
