import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { diagramFile } from '@/formats/file/diagram-file';
import { useEditorStore } from '@/store/store-context';
import { downloadText } from './download-file';
import '@/i18n/editor/register';

export interface ExportJsonDialogProps {
    open: boolean;
    onClose: () => void;
}

/** Saves the diagram as a .json file (spec 9.3); local-only data is left out. */
export const ExportJsonDialog: React.FC<ExportJsonDialogProps> = ({
    open,
    onClose,
}) => {
    const { t } = useTranslation();
    const design = useEditorStore((s) => s.design);
    const file = useMemo(
        () => (open ? diagramFile(design) : undefined),
        [design, open]
    );
    const kilobytes = file
        ? Math.max(1, Math.round(new Blob([file.text]).size / 1024))
        : 0;

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.exporting.json.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.exporting.json.description')}
                    </DialogDescription>
                </DialogHeader>
                {file ? (
                    <p className="text-sm text-muted-foreground">
                        {t('editor.exporting.json.summary', {
                            name: file.fileName,
                            size: kilobytes,
                        })}
                    </p>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('editor.common.cancel')}
                    </Button>
                    <Button
                        disabled={!file}
                        onClick={() => {
                            if (!file) return;
                            downloadText(
                                file.text,
                                file.fileName,
                                'application/json'
                            );
                            onClose();
                        }}
                    >
                        <Download /> {t('editor.exporting.json.download')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
