import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { useToast } from '@/components/toast/use-toast';
import { useChartDB } from '@/hooks/use-chartdb';
import { useQubdi } from '@/hooks/use-qubdi';
import {
    api,
    errorMessage,
    type DriftBadge,
    type DriftItem,
    type DriftOverview,
    type DriftReport,
    type SavedConnection,
} from '@/lib/qubdi/api';
import {
    SCHEDULE_PRESETS,
    SEVERITY_CLASS,
    SEVERITY_LABEL,
    presetIdOf,
    splitByCategory,
} from '@/lib/qubdi/drift-ui';
import { getSyncState } from '@/lib/qubdi/sync-state';

export interface DriftDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBadgeChange: (badge: DriftBadge | null) => void;
}

export const OPEN_RESYNC_EVENT = 'qubdi:open-resync';

const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm';

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
    const { currentDiagram } = useChartDB();
    const { syncDiagram, remoteIdFor } = useQubdi();
    const { toast } = useToast();
    const [overview, setOverview] = useState<DriftOverview | null>(null);
    const [report, setReport] = useState<DriftReport | null>(null);
    const [connections, setConnections] = useState<SavedConnection[]>([]);
    const [enabled, setEnabled] = useState(false);
    const [schedule, setSchedule] = useState('0 3 * * *');
    const [connectionId, setConnectionId] = useState('');
    const [webhook, setWebhook] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const syncState = open ? getSyncState(currentDiagram.id) : undefined;

    const load = useCallback(async () => {
        const remoteId = remoteIdFor(currentDiagram.id);
        setError(null);
        try {
            setConnections(await api.listSavedConnections());
            if (!remoteId) {
                setOverview(null);
                setReport(null);
                return;
            }
            const o = await api.getDrift(remoteId);
            setOverview(o);
            onBadgeChange(o.badge);
            if (o.settings) {
                setEnabled(o.settings.enabled);
                setSchedule(o.settings.schedule);
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
    }, [currentDiagram.id, remoteIdFor, onBadgeChange, syncState]);

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

    const save = () =>
        run(async (id) => {
            await api.saveDrift(id, {
                enabled,
                schedule: schedule.trim(),
                connectionId: connectionId || null,
                schemas: syncState?.schemas ?? [],
                tables: syncState?.tables ?? [],
                sourceKeys: syncState?.sourceKeys ?? {
                    tables: {},
                    columns: {},
                },
                webhookUrl: webhook.trim() || null,
            });
            toast({ title: 'Drift settings saved' });
            await load();
        });

    const checkNow = () =>
        run(async (id) => {
            const r = await api.checkDrift(id);
            setReport(r);
            const o = await api.getDrift(id);
            setOverview(o);
            onBadgeChange(o.badge);
        });

    const dismiss = () =>
        run(async (id) => {
            const res = await api.dismissDrift(id);
            onBadgeChange(res.badge);
            await load();
        });

    const split = report ? splitByCategory(report.changes) : null;
    const preset = presetIdOf(schedule);
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
                        void save();
                    }}
                >
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                        />
                        Check on a schedule
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="Schedule"
                            className={selectClass}
                            value={preset}
                            onChange={(e) => {
                                const p = SCHEDULE_PRESETS.find(
                                    (x) => x.id === e.target.value
                                );
                                if (p) setSchedule(p.cron);
                            }}
                        >
                            {SCHEDULE_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom">Custom…</option>
                        </select>
                        <Input
                            aria-label="Cron expression"
                            className="w-40 font-mono"
                            value={schedule}
                            onChange={(e) => setSchedule(e.target.value)}
                        />
                        <select
                            aria-label="Saved connection"
                            className={selectClass}
                            value={connectionId}
                            onChange={(e) => setConnectionId(e.target.value)}
                        >
                            <option value="">Choose a saved connection</option>
                            {connections.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <Input
                        aria-label="Webhook URL"
                        placeholder="Webhook URL (optional): receives a JSON POST when drift is found"
                        value={webhook}
                        onChange={(e) => setWebhook(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={busy}>
                            Save settings
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || !remoteId || !overview?.settings}
                            onClick={() => void checkNow()}
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
                            Last check {new Date(report.runAt).toLocaleString()}{' '}
                            ({report.trigger}):{' '}
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
                ) : remoteId && overview?.settings ? (
                    <p className="text-sm text-muted-foreground">
                        No check has run yet. Press Check now.
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
