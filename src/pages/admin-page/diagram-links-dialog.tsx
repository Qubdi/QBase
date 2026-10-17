import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { ShareLinkList } from '@/components/qubdi/share-link-list';
import { useToast } from '@/components/toast/use-toast';
import {
    api,
    errorMessage,
    type AdminDiagram,
    type AdminShareLink,
} from '@/lib/qubdi/api';

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
    const diagramId = diagram?.id;

    useEffect(() => {
        setLinks(null);
        setError(null);
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
            if (!diagramId) return false;
            setError(null);
            try {
                await api.adminRevokeDiagramLink(diagramId, link.id);
                setLinks(await api.adminListDiagramLinks(diagramId));
                onChanged();
                toast({
                    title: 'Link revoked',
                    description:
                        'Its address no longer opens the diagram, for anyone.',
                });
                return true;
            } catch (e) {
                setError(errorMessage(e));
                return false;
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

                <ShareLinkList
                    key={diagramId}
                    links={links}
                    failed={error !== null}
                    onRevoke={revoke}
                />

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
