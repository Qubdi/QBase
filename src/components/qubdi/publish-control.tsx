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
    publishStatusText,
    type PublishStatus,
} from '@/lib/qubdi/publish-status';

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
            <span
                className="hidden text-xs text-muted-foreground lg:inline"
                data-testid="publish-status"
            >
                {publishStatusText(status)}
            </span>
            <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                    void refresh();
                    setOpen(true);
                }}
            >
                <Rocket className="size-4" />
                Publish
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
