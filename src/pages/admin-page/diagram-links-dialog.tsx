import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/badge/badge';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { useToast } from '@/components/toast/use-toast';
import {
    api,
    errorMessage,
    type AdminDiagram,
    type AdminShareLink,
    type ShareLinkStatus,
} from '@/lib/qubdi/api';
import {
    ACCESS_LABEL,
    canRevoke,
    expiryText,
    STATUS_LABEL,
} from '@/lib/qubdi/share-links';
import { ago, exactTime } from '@/lib/qubdi/when';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<
    ShareLinkStatus,
    { variant: 'outline' | 'secondary' | 'destructive'; className?: string }
> = {
    active: {
        variant: 'outline',
        className:
            'border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-400',
    },
    off: { variant: 'secondary' },
    expired: { variant: 'secondary' },
    revoked: { variant: 'destructive' },
};

export interface DiagramLinksDialogProps {
    /** the diagram whose links are shown; null keeps the dialog closed */
    diagram: AdminDiagram | null;
    onClose: () => void;
    /** called after a link was revoked, so the list behind can refresh its counts */
    onChanged: () => void;
}

/** A diagram's share links, with a way to end any of them at once. */
export const DiagramLinksDialog: React.FC<DiagramLinksDialogProps> = ({
    diagram,
    onClose,
    onChanged,
}) => {
    const { toast } = useToast();
    const [links, setLinks] = useState<AdminShareLink[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    // the link waiting for a second click, and the one being ended
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const diagramId = diagram?.id;

    useEffect(() => {
        setLinks(null);
        setError(null);
        setConfirming(null);
        if (!diagramId) return;
        let stale = false;
        api.adminListDiagramLinks(diagramId)
            .then((list) => {
                if (!stale) setLinks(list);
            })
            .catch((e: unknown) => {
                if (!stale) setError(errorMessage(e));
            });
        return () => {
            stale = true;
        };
    }, [diagramId]);

    const revoke = useCallback(
        async (link: AdminShareLink) => {
            if (!diagramId) return;
            setError(null);
            setBusy(link.id);
            try {
                await api.adminRevokeDiagramLink(diagramId, link.id);
                setLinks(await api.adminListDiagramLinks(diagramId));
                setConfirming(null);
                onChanged();
                toast({
                    title: 'Link revoked',
                    description:
                        'Its address no longer opens the diagram, for anyone.',
                });
            } catch (e) {
                setError(errorMessage(e));
            } finally {
                setBusy(null);
            }
        },
        [diagramId, onChanged, toast]
    );

    return (
        <Dialog open={diagram !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg" showClose>
                <DialogHeader>
                    <DialogTitle>Share links</DialogTitle>
                    <DialogDescription>
                        {diagram?.title}. The address of a link is shown once,
                        to the person who made it, so it cannot be listed here;
                        it can be ended.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                {links === null && !error ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : links !== null && links.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        This diagram has no share links.
                    </p>
                ) : (
                    <ul
                        aria-label="Share links"
                        className="flex max-h-96 flex-col gap-2 overflow-y-auto"
                    >
                        {links?.map((l) => {
                            const badge = STATUS_BADGE[l.status];
                            return (
                                <li
                                    key={l.id}
                                    className={cn(
                                        'flex flex-col gap-2 rounded-md border p-3 text-sm',
                                        l.status === 'revoked' &&
                                            'text-muted-foreground'
                                    )}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                            variant={badge.variant}
                                            className={badge.className}
                                        >
                                            {STATUS_LABEL[l.status]}
                                        </Badge>
                                        <span className="font-medium">
                                            {ACCESS_LABEL[l.access]}
                                        </span>
                                        {l.live ? (
                                            <Badge variant="secondary">
                                                Live
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                        <div className="flex flex-col text-muted-foreground">
                                            <span>
                                                {l.createdByEmail ? (
                                                    <>
                                                        Made by{' '}
                                                        <span className="text-foreground">
                                                            {l.createdByEmail}
                                                        </span>
                                                    </>
                                                ) : (
                                                    'Made by a deleted user'
                                                )}{' '}
                                                <time
                                                    dateTime={l.createdAt}
                                                    title={exactTime(
                                                        l.createdAt
                                                    )}
                                                >
                                                    {ago(l.createdAt)}
                                                </time>
                                            </span>
                                            <span>{expiryText(l)}</span>
                                        </div>
                                        {canRevoke(l) ? (
                                            confirming === l.id ? (
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={busy !== null}
                                                        onClick={() =>
                                                            void revoke(l)
                                                        }
                                                    >
                                                        Yes, revoke
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy !== null}
                                                        onClick={() =>
                                                            setConfirming(null)
                                                        }
                                                    >
                                                        Keep
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={busy !== null}
                                                    onClick={() =>
                                                        setConfirming(l.id)
                                                    }
                                                >
                                                    Revoke
                                                </Button>
                                            )
                                        ) : null}
                                    </div>
                                    {confirming === l.id ? (
                                        <p className="text-xs text-muted-foreground">
                                            Anyone using this link loses access
                                            at once, including people watching
                                            it live. This cannot be undone.
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
