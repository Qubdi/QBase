import React, { useCallback, useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import { useToast } from '@/components/toast/use-toast';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, errorMessage } from '@/lib/qubdi/api';
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
    const { enabled, user, syncDiagram, remoteIdFor } = useQubdi();
    const { currentDiagram } = useDiagram();
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
            const d = await api.getDiagram(remoteId);
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

    useEffect(() => {
        if (user) void refresh();
    }, [user, refresh, currentDiagram.id]);

    if (!enabled || !user) return null;

    const badge = publishStatusBadge(status);

    const publish = async () => {
        setBusy(true);
        try {
            const id = await syncDiagram(currentDiagram);
            if (autoPublish) await api.updateDiagram(id, { autoPublish });
            const res = await api.publish(id, note.trim() || undefined);
            setNote('');
            setOpen(false);
            toast({ title: `Published v${res.version}` });
            await refresh();
        } catch (e) {
            toast({
                title: 'Publish failed',
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
            await api.updateDiagram(remoteId, { autoPublish: value });
        } catch (e) {
            setAutoPublish(!value);
            toast({
                title: 'Could not change the setting',
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
                aria-label={`Publish. ${publishStatusText(status)}`}
                onClick={() => {
                    void refresh();
                    setOpen(true);
                }}
            >
                <Rocket className="size-4" />
                Publish
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
                        <DialogTitle>Publish diagram</DialogTitle>
                        <DialogDescription>
                            {publishStatusText(status)}. Viewers only see
                            published versions.
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
                            placeholder="Note (optional)"
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
                            Auto-publish on every save
                        </label>
                        <Button type="submit" disabled={busy}>
                            Publish
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
};
