import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShareLinkList } from '@/components/qubdi/share-link-list';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { useToast } from '@/platform/toast/use-toast';
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
    /** a link was revoked: the list behind the dialog is out of date */
    onChanged: () => void;
}

/**
 * Every share link of one diagram, in every state, so an admin can end any of
 * them. The address of a link is never listed: the server shows it once, to
 * the person who made it.
 */
export const DiagramLinksDialog: React.FC<DiagramLinksDialogProps> = ({
    diagram,
    onClose,
    onChanged,
}) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const diagramId = diagram?.id;
    const [links, setLinks] = useState<AdminShareLink[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (id: string) => {
        setLinks(await api.adminListDiagramLinks(id));
    }, []);

    // another diagram starts from nothing: no old links, no old error
    useEffect(() => {
        setLinks(null);
        setError(null);
        if (!diagramId) return;
        let cancelled = false;
        api.adminListDiagramLinks(diagramId)
            .then((list) => !cancelled && setLinks(list))
            .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
        return () => {
            cancelled = true;
        };
    }, [diagramId]);

    const revoke = async (link: AdminShareLink): Promise<boolean> => {
        if (!diagramId) return false;
        setError(null);
        try {
            await api.adminRevokeDiagramLink(diagramId, link.id);
            await load(diagramId);
        } catch (e) {
            setError(errorMessage(e));
            return false;
        }
        onChanged();
        toast({
            title: t('qubdi.adminProjects.links.revokedTitle'),
            description: t('qubdi.adminProjects.links.revokedBody'),
        });
        return true;
    };

    return (
        <Dialog open={diagram !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {t('qubdi.adminProjects.links.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('qubdi.adminProjects.links.description', {
                            title: diagram?.title ?? '',
                        })}
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
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('qubdi.adminProjects.links.close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
