import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/components/input/input';
import { useDiagram } from '@/hooks/use-diagram';
import { getProjectId } from '@/lib/qubdi/remote-map';
import { useQubdi } from '@/hooks/use-qubdi';
import {
    api,
    errorMessage,
    type DriftBadge,
    type DriftItem,
    type DriftReport,
    type SavedConnection,
} from '@/lib/qubdi/api';
import {
    SEVERITY_CLASS,
    SEVERITY_LABEL,
    splitByCategory,
} from '@/lib/qubdi/drift-ui';
import { getSyncState } from '@/lib/qubdi/sync-state';
import { ConnectionsDialog } from './connections-dialog';
import { useWorkspace } from './workspace-context';

export interface DriftDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBadgeChange: (badge: DriftBadge | null) => void;
}

export const OPEN_RESYNC_EVENT = 'qubdi:open-resync';

const ChangeList: React.FC<{ title: string; items: DriftItem[] }> = ({
    title,
    items,
}) => (
    <section className="rounded-md border p-2" aria-label={title}>
        <h3 className="mb-1 text-sm font-medium">
            {title} ({items.length})
        </h3>
        {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing.</p>
        ) : (
            <ul className="flex flex-col gap-1 text-sm">
                {items.map((i) => (
                    <li key={i.id} className="flex items-start gap-2">
                        <span
                            className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[i.severity]}`}
                        >
                            {SEVERITY_LABEL[i.severity]}
                        </span>
                        <span>{i.summary}</span>
                    </li>
                ))}
            </ul>
        )}
    </section>
);

export const DriftDialog: React.FC<DriftDialogProps> = ({
    open,
    onOpenChange,
    onBadgeChange,
}) => {
    const { currentDiagram } = useDiagram();
    const { syncDiagram, remoteIdFor } = useQubdi();
    const workspace = useWorkspace();
    const [report, setReport] = useState<DriftReport | null>(null);
    const [connections, setConnections] = useState<SavedConnection[]>([]);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [connectionId, setConnectionId] = useState('');
    const [webhook, setWebhook] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const syncState = open ? getSyncState(currentDiagram.id) : undefined;
    const projectId = workspace?.project.id ?? getProjectId(currentDiagram.id);

    const load = useCallback(async () => {
        const remoteId = remoteIdFor(currentDiagram.id);
        setError(null);
        try {
            setConnections(
                projectId
                    ? await api.listSavedConnections(projectId).catch(() => [])
                    : []
            );
            if (!remoteId) {
                setReport(null);
                return;
            }
            const o = await api.getDrift(remoteId);
            onBadgeChange(o.badge);
            if (o.settings) {
                setConnectionId(o.settings.connectionId ?? '');
                setWebhook(o.settings.webhookUrl ?? '');
            } else if (syncState?.source.kind === 'saved') {
                setConnectionId(syncState.source.savedConnectionId);
            }
            setReport(
                o.latest
                    ? await api.getDriftReport(remoteId, o.latest.id)
                    : null
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }, [currentDiagram.id, projectId, remoteIdFor, onBadgeChange, syncState]);

    // the connections changed in the connections dialog: refresh the choice
    const reloadConnections = useCallback(async () => {
        if (!projectId) return;
        const list = await api.listSavedConnections(projectId).catch(() => []);
        setConnections(list);
        setConnectionId((current) =>
            current && !list.some((c) => c.id === current)
                ? ''
                : current || (list.length === 1 ? list[0].id : '')
        );
    }, [projectId]);

    useEffect(() => {
        if (open) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const run = async (fn: (remoteId: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            // drift compares the server copy, so make sure it is current
            const remoteId = await syncDiagram(currentDiagram);
            await fn(remoteId);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    // what to compare with is remembered with the diagram, so Check now saves it first
    const checkNow = () =>
        run(async (id) => {
            await api.saveDrift(id, {
                connectionId: connectionId || null,
                schemas: syncState?.schemas ?? [],
                tables: syncState?.tables ?? [],
                sourceKeys: syncState?.sourceKeys ?? {
                    tables: {},
                    columns: {},
                },
                webhookUrl: webhook.trim() || null,
            });
            const r = await api.checkDrift(id);
            setReport(r);
            const o = await api.getDrift(id);
            onBadgeChange(o.badge);
        });

    const dismiss = () =>
        run(async (id) => {
            const res = await api.dismissDrift(id);
            onBadgeChange(res.badge);
            await load();
        });

    const split = report ? splitByCategory(report.changes) : null;
    const remoteId = remoteIdFor(currentDiagram.id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl" showClose>
                <DialogHeader>
                    <DialogTitle>Database drift</DialogTitle>
                    <DialogDescription>
                        Compares this diagram with the live database and tells
                        you where they no longer match.
                    </DialogDescription>
                </DialogHeader>

                {!remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        This diagram is not on the server yet. It is uploaded
                        automatically when you save the settings.
                    </p>
                ) : null}

                <form
                    className="flex flex-col gap-3 rounded-md border p-3 text-sm"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void checkNow();
                    }}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <OptionSelect
                            aria-label="Saved connection"
                            className="w-56"
                            placeholder="Choose a saved connection"
                            value={connectionId}
                            onValueChange={setConnectionId}
                            options={connections.map((c) => ({
                                value: c.id,
                                label: c.name,
                            }))}
                        />
                        {projectId ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setConnectionsOpen(true)}
                            >
                                {connections.length === 0
                                    ? 'Add a connection'
                                    : 'Manage connections'}
                            </Button>
                        ) : null}
                    </div>
                    {connections.length === 0 && projectId ? (
                        <p className="text-muted-foreground">
                            There is no saved connection in this project yet.
                            Add the database this diagram describes to compare
                            it with.
                        </p>
                    ) : null}
                    <Input
                        aria-label="Webhook URL"
                        placeholder="Webhook URL (optional): receives a JSON POST when drift is found"
                        value={webhook}
                        onChange={(e) => setWebhook(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button
                            type="submit"
                            size="sm"
                            disabled={busy || !connectionId}
                        >
                            {busy ? 'Working…' : 'Check now'}
                        </Button>
                    </div>
                </form>

                {error ? (
                    <p role="alert" className="text-sm text-red-500">
                        {error}
                    </p>
                ) : null}

                {report ? (
                    <div
                        className="flex flex-col gap-3"
                        data-testid="drift-report"
                    >
                        <p className="text-sm">
                            Last check {new Date(report.runAt).toLocaleString()}
                            :{' '}
                            <strong data-testid="drift-status">
                                {report.status === 'clean'
                                    ? 'no drift'
                                    : report.status === 'error'
                                      ? 'check failed'
                                      : `${report.changes.length} difference(s)`}
                            </strong>
                            {report.webhook
                                ? ` · webhook ${report.webhook}`
                                : ''}
                        </p>
                        {report.status === 'error' ? (
                            <p role="alert" className="text-sm text-red-500">
                                {report.error}
                            </p>
                        ) : null}
                        {split && report.status === 'drifted' ? (
                            <>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <ChangeList
                                        title="Only in the database"
                                        items={split.onlyInDatabase}
                                    />
                                    <ChangeList
                                        title="Only in the diagram"
                                        items={split.onlyInDiagram}
                                    />
                                </div>
                                <ChangeList
                                    title="Definitions differ"
                                    items={split.differs}
                                />
                                {report.renameHints.length > 0 ? (
                                    <ul className="text-xs text-muted-foreground">
                                        {report.renameHints.map((h) => (
                                            <li key={h}>Hint: {h}</li>
                                        ))}
                                    </ul>
                                ) : null}
                            </>
                        ) : null}
                        {report.status !== 'clean' ? (
                            <div className="flex gap-2">
                                {report.status === 'drifted' ? (
                                    <Button
                                        size="sm"
                                        disabled={!syncState}
                                        title={
                                            syncState
                                                ? undefined
                                                : 'This diagram was not imported from a database in this browser'
                                        }
                                        onClick={() => {
                                            onOpenChange(false);
                                            window.dispatchEvent(
                                                new CustomEvent(
                                                    OPEN_RESYNC_EVENT
                                                )
                                            );
                                        }}
                                    >
                                        Update diagram from database
                                    </Button>
                                ) : null}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy || !!report.dismissedAt}
                                    onClick={() => void dismiss()}
                                >
                                    {report.dismissedAt
                                        ? 'Dismissed'
                                        : 'Dismiss'}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ) : remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        No check has run yet. Choose a connection and press
                        Check now.
                    </p>
                ) : null}
            </DialogContent>
            {projectId ? (
                <ConnectionsDialog
                    open={connectionsOpen}
                    onOpenChange={setConnectionsOpen}
                    project={{
                        id: projectId,
                        name: workspace?.project.name ?? 'this project',
                    }}
                    onChanged={() => void reloadConnections()}
                />
            ) : null}
        </Dialog>
    );
};
