import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Button } from '@/platform/ui/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/platform/ui/input';
import { useDiagram } from '@/qbase/use-diagram';
import { getProjectId } from '@/lib/qubdi/remote-map';
import { flushPendingSave } from '@/lib/qubdi/save-status-store';
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
    severityLabel,
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
}) => {
    const { t } = useTranslation();
    return (
        <section className="rounded-md border p-2" aria-label={title}>
            <h3 className="mb-1 text-sm font-medium">
                {title} ({items.length})
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    {t('qubdi.database.drift.nothing')}
                </p>
            ) : (
                <ul className="flex flex-col gap-1 text-sm">
                    {items.map((i) => (
                        <li key={i.id} className="flex items-start gap-2">
                            <span
                                className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[i.severity]}`}
                            >
                                {severityLabel(i.severity)}
                            </span>
                            <span>{i.summary}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export const DriftDialog: React.FC<DriftDialogProps> = ({
    open,
    onOpenChange,
    onBadgeChange,
}) => {
    const { t } = useTranslation();
    const { currentDiagram } = useDiagram();
    const { syncDiagram, remoteIdFor } = useQubdi();
    const workspace = useWorkspace();
    const [report, setReport] = useState<DriftReport | null>(null);
    const [connections, setConnections] = useState<SavedConnection[]>([]);
    const [connectionsOpen, setConnectionsOpen] = useState(false);
    const [connectionId, setConnectionId] = useState('');
    const [webhook, setWebhook] = useState('');
    // the saved URL is never sent back, only its host; `webhook` holds what was typed since
    const [webhookHost, setWebhookHost] = useState<string | null>(null);
    const [webhookEdited, setWebhookEdited] = useState(false);
    // what the server already holds to compare with: sent again when this
    // browser has no sync state of its own, so a check never blanks it
    const serverScope = useRef<{
        schemas: string[];
        tables: string[];
        sourceKeys: {
            tables: Record<string, string>;
            columns: Record<string, string>;
        };
    } | null>(null);
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
            serverScope.current = o.settings
                ? {
                      schemas: o.settings.schemas,
                      tables: o.settings.tables,
                      sourceKeys: o.settings.sourceKeys,
                  }
                : null;
            if (o.settings) {
                setConnectionId(o.settings.connectionId ?? '');
                setWebhook('');
                setWebhookEdited(false);
                setWebhookHost(o.settings.webhookHost ?? null);
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

    // loads when the dialog opens, not whenever one of what `load` reads changes
    const loadRef = useRef(load);
    loadRef.current = load;
    useEffect(() => {
        if (open) void loadRef.current();
    }, [open]);

    const run = async (fn: (remoteId: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            // drift compares the server copy, so make sure it is current; the
            // autosaver finishes first so both saves never share one base version
            await flushPendingSave();
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
                schemas:
                    syncState?.schemas ?? serverScope.current?.schemas ?? [],
                tables: syncState?.tables ?? serverScope.current?.tables ?? [],
                sourceKeys: syncState?.sourceKeys ??
                    serverScope.current?.sourceKeys ?? {
                        tables: {},
                        columns: {},
                    },
                ...(webhookEdited
                    ? { webhookUrl: webhook.trim() || null }
                    : {}),
            });
            if (webhookEdited) {
                setWebhookHost(
                    webhook.trim() ? new URL(webhook.trim()).host : null
                );
                setWebhook('');
                setWebhookEdited(false);
            }
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

    // a saved webhook with nothing typed over it, after Remove: the next save clears it
    const removingWebhook =
        webhookHost !== null && webhookEdited && webhook.trim() === '';
    const split = report ? splitByCategory(report.changes) : null;
    const remoteId = remoteIdFor(currentDiagram.id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl" showClose>
                <DialogHeader>
                    <DialogTitle>{t('qubdi.database.drift.title')}</DialogTitle>
                    <DialogDescription>
                        {t('qubdi.database.drift.description')}
                    </DialogDescription>
                </DialogHeader>

                {!remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.database.drift.notOnServer')}
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
                            aria-label={t(
                                'qubdi.database.drift.savedConnection'
                            )}
                            className="w-56"
                            placeholder={t(
                                'qubdi.database.drift.chooseConnection'
                            )}
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
                                    ? t('qubdi.database.drift.addConnection')
                                    : t(
                                          'qubdi.database.drift.manageConnections'
                                      )}
                            </Button>
                        ) : null}
                    </div>
                    {connections.length === 0 && projectId ? (
                        <p className="text-muted-foreground">
                            {t('qubdi.database.drift.noConnections')}
                        </p>
                    ) : null}
                    {/* the saved URL never comes back, so removing it is a button of its own */}
                    <div className="flex gap-2">
                        <Input
                            aria-label={t('qubdi.database.drift.webhookLabel')}
                            placeholder={
                                removingWebhook
                                    ? t('qubdi.database.drift.webhookRemoved')
                                    : webhookHost
                                      ? t('qubdi.database.drift.webhookSaved', {
                                            host: webhookHost,
                                        })
                                      : t(
                                            'qubdi.database.drift.webhookPlaceholder'
                                        )
                            }
                            value={webhook}
                            onChange={(e) => {
                                setWebhook(e.target.value);
                                setWebhookEdited(true);
                            }}
                        />
                        {webhookHost && !removingWebhook ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setWebhook('');
                                    setWebhookEdited(true);
                                }}
                            >
                                {t('qubdi.database.drift.removeWebhook')}
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            type="submit"
                            size="sm"
                            disabled={busy || !connectionId}
                        >
                            {busy
                                ? t('qubdi.database.drift.working')
                                : t('qubdi.database.drift.checkNow')}
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
                            {t('qubdi.database.drift.lastCheck', {
                                date: new Date(report.runAt).toLocaleString(),
                            })}{' '}
                            <strong data-testid="drift-status">
                                {report.status === 'clean'
                                    ? t('qubdi.database.drift.statusClean')
                                    : report.status === 'error'
                                      ? t('qubdi.database.drift.statusError')
                                      : t(
                                            'qubdi.database.drift.statusDrifted',
                                            {
                                                n: report.changes.length,
                                            }
                                        )}
                            </strong>
                            {report.webhook
                                ? t('qubdi.database.drift.webhookSuffix', {
                                      url: report.webhook,
                                  })
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
                                        title={t(
                                            'qubdi.database.drift.onlyInDatabase'
                                        )}
                                        items={split.onlyInDatabase}
                                    />
                                    <ChangeList
                                        title={t(
                                            'qubdi.database.drift.onlyInDiagram'
                                        )}
                                        items={split.onlyInDiagram}
                                    />
                                </div>
                                <ChangeList
                                    title={t('qubdi.database.drift.differs')}
                                    items={split.differs}
                                />
                                {report.renameHints.length > 0 ? (
                                    <ul className="text-xs text-muted-foreground">
                                        {report.renameHints.map((h) => (
                                            <li key={h}>
                                                {t(
                                                    'qubdi.database.drift.hint',
                                                    { hint: h }
                                                )}
                                            </li>
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
                                                : t(
                                                      'qubdi.database.drift.notImported'
                                                  )
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
                                        {t('qubdi.database.drift.update')}
                                    </Button>
                                ) : null}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy || !!report.dismissedAt}
                                    onClick={() => void dismiss()}
                                >
                                    {report.dismissedAt
                                        ? t('qubdi.database.drift.dismissed')
                                        : t('qubdi.database.drift.dismiss')}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ) : remoteId ? (
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.database.drift.noCheckYet')}
                    </p>
                ) : null}
            </DialogContent>
            {projectId ? (
                <ConnectionsDialog
                    open={connectionsOpen}
                    onOpenChange={setConnectionsOpen}
                    project={{
                        id: projectId,
                        name:
                            workspace?.project.name ??
                            t('qubdi.database.drift.thisProject'),
                    }}
                    onChanged={() => void reloadConnections()}
                />
            ) : null}
        </Dialog>
    );
};
