import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { Checkbox } from '@/platform/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Label } from '@/platform/ui/label';
import { Spinner } from '@/platform/ui/spinner';
import { toast } from '@/platform/toast/use-toast';
import { useTheme } from '@/platform/theme/theme-context';
import { DEFAULT_IMAGE_OPTIONS } from '@/formats/image/export-options';
import type { ImageFormat } from '@/formats/image/export-options';
import { useEditorStoreApi } from '@/store/store-context';
import { CaptureError, runImageExport } from './run-image-export';

export interface ExportImageDialogProps {
    /** PNG or JPEG; undefined keeps the dialog closed */
    format?: Exclude<ImageFormat, 'svg'>;
    getTarget: () => HTMLElement | null;
    onClose: () => void;
}

const SCALES = [1, 2, 4] as const;

/** The options of a PNG or JPEG export: scale, dot background, transparency. */
export const ExportImageDialog: React.FC<ExportImageDialogProps> = ({
    format,
    getTarget,
    onClose,
}) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const { resolvedTheme } = useTheme();
    const [scale, setScale] = useState<1 | 2 | 4>(DEFAULT_IMAGE_OPTIONS.scale);
    const [pattern, setPattern] = useState(DEFAULT_IMAGE_OPTIONS.pattern);
    const [transparent, setTransparent] = useState(
        DEFAULT_IMAGE_OPTIONS.transparent
    );
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!format) return;
        setScale(DEFAULT_IMAGE_OPTIONS.scale);
        setPattern(DEFAULT_IMAGE_OPTIONS.pattern);
        setTransparent(DEFAULT_IMAGE_OPTIONS.transparent);
    }, [format]);

    const run = async () => {
        if (!format) return;
        setBusy(true);
        try {
            await runImageExport({
                format,
                design: store.getState().design,
                theme: resolvedTheme,
                getTarget,
                prepare: () => store.getState().select([]),
                options: { scale, pattern, transparent },
            });
            onClose();
        } catch (error) {
            const reason =
                error instanceof CaptureError ? error.reason : 'failed';
            toast({
                title: t(
                    reason === 'empty'
                        ? 'editor.exporting.image.empty'
                        : 'editor.exporting.image.failed'
                ),
                variant: 'destructive',
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={!!format}
            onOpenChange={(open) => !open && !busy && onClose()}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.exporting.image.title', {
                            format: format?.toUpperCase() ?? '',
                        })}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.exporting.image.description')}
                    </DialogDescription>
                </DialogHeader>
                <fieldset className="flex flex-col gap-2" disabled={busy}>
                    <legend className="mb-1 text-sm font-medium">
                        {t('editor.exporting.image.scale')}
                    </legend>
                    <div
                        className="flex gap-2"
                        role="radiogroup"
                        aria-label={t('editor.exporting.image.scale')}
                    >
                        {SCALES.map((s) => (
                            <Button
                                key={s}
                                type="button"
                                role="radio"
                                aria-checked={scale === s}
                                variant={scale === s ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setScale(s)}
                            >
                                {s}x
                            </Button>
                        ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                            id="export-pattern"
                            checked={pattern}
                            onCheckedChange={(v) => setPattern(v === true)}
                        />
                        <Label htmlFor="export-pattern">
                            {t('editor.exporting.image.pattern')}
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="export-transparent"
                            checked={transparent}
                            onCheckedChange={(v) => setTransparent(v === true)}
                        />
                        <Label htmlFor="export-transparent">
                            {t('editor.exporting.image.transparent')}
                        </Label>
                    </div>
                    {format === 'jpeg' && transparent ? (
                        <p className="text-xs text-muted-foreground">
                            {t('editor.exporting.image.jpegNote')}
                        </p>
                    ) : null}
                </fieldset>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        {t('editor.common.cancel')}
                    </Button>
                    <Button onClick={() => void run()} disabled={busy}>
                        {busy ? <Spinner size="small" /> : null}
                        {busy
                            ? t('editor.exporting.image.working')
                            : t('editor.exporting.image.action')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
