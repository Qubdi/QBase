import React, { useCallback, useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
import { useToast } from '@/platform/toast/use-toast';
import { useDiagram } from '@/qbase/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { useDiagramAccess } from './diagram-access-context';
import { api, errorMessage } from '@/lib/qubdi/api';
import { getEditorId } from '@/lib/qubdi/editor-id';
import { setBaseUpdatedAt } from '@/lib/qubdi/remote-version';
import { flushPendingSave, useSaveStatus } from '@/lib/qubdi/save-status-store';
import {
    publishStatusBadge,
    publishStatusText,
    type PublishStatus,
    type PublishTone,
} from '@/lib/qubdi/publish-status';

// a version pill has the same shape as the Lint and Drift badges
const PILL_CLASS: Record<PublishTone, string> = {
    neutral: 'bg-muted text-muted-foreground',
    warning:
        'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    success: 'bg-primary/15 text-primary',
};
// with no version to show, the badge is only a coloured dot
const DOT_CLASS: Record<PublishTone, string> = {
    neutral: 'bg-muted-foreground/50',
    warning: 'bg-amber-500',
    success: 'bg-primary',
};

export const PublishControl: React.FC = () => {
    const { t } = useTranslation();
    const { enabled, user, syncDiagram, remoteIdFor } = useQubdi();
    const { currentDiagram } = useDiagram();
    const { access } = useDiagramAccess();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [autoPublish, setAutoPublish] = useState(false);
    const [status, setStatus] = useState<PublishStatus>({
        synced: false,
        publishedVersion: null,
        unpublishedChanges: true,
    });

    const remoteId = remoteIdFor(currentDiagram.id);

    const refresh = useCallback(async () => {
        if (!remoteId) {
            setStatus({
                synced: false,
                publishedVersion: null,
                unpublishedChanges: true,
            });
            return;
        }
        try {
            const d = await api.getPublishStatus(remoteId);
            setStatus({
                synced: true,
                publishedVersion: d.publishedVersion,
                unpublishedChanges: d.unpublishedChanges ?? false,
            });
            setAutoPublish(d.autoPublish ?? false);
        } catch {
            // keep the previous status; the next action will surface any error
        }
    }, [remoteId]);

    const canPublish = access.status === 'editor';

    // a save that reached the server may have left changes that are not
    // published: the badge must say so without a click (found in a real browser)
    const saved = useSaveStatus().status === 'saved';
    useEffect(() => {
        if (user && canPublish) void refresh();
    }, [user, canPublish, refresh, currentDiagram.id, saved]);

    // only the editor who holds the diagram publishes: a viewer, or an editor
    // whose lock went to someone else, has nothing to publish from here
    if (!enabled || !user || !canPublish) return null;

    const badge = publishStatusBadge(status);

    // The server takes a save only from the editor holding the diagram's lock,
    // so it is told which editor this is. The save moves `updatedAt`: the new
    // value becomes the base of the next autosave, or that save would be a
    // conflict with this one.
    const saveAutoPublish = async (id: string, value: boolean) => {
        const updated = await api.updateDiagram(id, {
            autoPublish: value,
            editorId: getEditorId(),
        });
        if (updated?.updatedAt) {
            setBaseUpdatedAt(currentDiagram.id, updated.updatedAt);
        }
    };

    const publish = async () => {
        setBusy(true);
        try {
            // the autosaver may be holding or sending edits: let it finish, so
            // this save and its own never go out with the same base version
            await flushPendingSave();
            const id = await syncDiagram(currentDiagram);
            if (autoPublish) await saveAutoPublish(id, autoPublish);
            const res = await api.publish(id, note.trim() || undefined);
            setNote('');
            setOpen(false);
            toast({
                title: t('qubdi.workspace.publish.published', {
                    version: res.version,
                }),
            });
            await refresh();
        } catch (e) {
            toast({
                title: t('qubdi.workspace.publish.failed'),
                description: errorMessage(e),
                variant: 'destructive',
            });
        } finally {
            setBusy(false);
        }
    };

    const toggleAuto = async (value: boolean) => {
        setAutoPublish(value);
        if (!remoteId) return;
        try {
            await saveAutoPublish(remoteId, value);
        } catch (e) {
            setAutoPublish(!value);
            toast({
                title: t('qubdi.workspace.publish.settingFailed'),
                description: errorMessage(e),
                variant: 'destructive',
            });
        }
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1"
                title={publishStatusText(status)}
                aria-label={t('qubdi.workspace.publish.buttonAria', {
                    status: publishStatusText(status),
                })}
                onClick={() => {
                    void refresh();
                    setOpen(true);
                }}
            >
                <Rocket className="size-4" />
                {t('qubdi.workspace.publish.button')}
                {badge.label ? (
                    <span
                        data-testid="publish-status"
                        className={`rounded-full px-1.5 text-[10px] font-semibold ${PILL_CLASS[badge.tone]}`}
                    >
                        {badge.label}
                    </span>
                ) : (
                    <span
                        data-testid="publish-status"
                        className={`size-2 rounded-full ${DOT_CLASS[badge.tone]}`}
                    />
                )}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm" showClose>
                    <DialogHeader>
                        <DialogTitle>
                            {t('qubdi.workspace.publish.title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('qubdi.workspace.publish.description', {
                                status: publishStatusText(status),
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void publish();
                        }}
                    >
                        <Input
                            placeholder={t('qubdi.workspace.publish.note')}
                            aria-label={t('qubdi.workspace.publish.note')}
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={autoPublish}
                                onChange={(e) =>
                                    void toggleAuto(e.target.checked)
                                }
                            />
                            {t('qubdi.workspace.publish.autoPublish')}
                        </label>
                        <Button type="submit" disabled={busy}>
                            {t('qubdi.workspace.publish.button')}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};
