import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
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
import { OptionSelect } from '@/components/option-select/option-select';
import { cn } from '@/lib/utils/utils';
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
const BEST_SCALE = 4;

/** The options of a PNG or JPEG export: scale, dot background, transparency. */
export const ExportImageDialog: React.FC<ExportImageDialogProps> = ({
    format,
    getTarget,
    onClose,
}) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const { resolvedTheme } = useTheme();
    const [advanced, setAdvanced] = useState(false);
    const [scale, setScale] = useState<1 | 2 | 4>(DEFAULT_IMAGE_OPTIONS.scale);
    const [pattern, setPattern] = useState(DEFAULT_IMAGE_OPTIONS.pattern);
    const [transparent, setTransparent] = useState(
        DEFAULT_IMAGE_OPTIONS.transparent
    );
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!format) return;
        setAdvanced(false);
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
                onLowered: (ratio) =>
                    toast({
                        title: t('editor.exporting.image.lowered', {
                            scale: Math.floor(ratio * 100) / 100,
                        }),
                    }),
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
            <DialogContent className="max-w-lg">
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
                <fieldset className="flex flex-col gap-3" disabled={busy}>
                    <OptionSelect
                        aria-label={t('editor.exporting.image.scale')}
                        value={String(scale)}
                        onValueChange={(v) => setScale(Number(v) as 1 | 2 | 4)}
                        options={SCALES.map((s) => ({
                            value: String(s),
                            label:
                                s === BEST_SCALE
                                    ? t('editor.exporting.image.scaleBest', {
                                          scale: s,
                                      })
                                    : `${s}x`,
                        }))}
                    />
                    <button
                        type="button"
                        aria-expanded={advanced}
                        className="flex items-center justify-between rounded-md py-1 text-sm font-medium hover:underline"
                        onClick={() => setAdvanced((v) => !v)}
                    >
                        {t('editor.exporting.image.advanced')}
                        <ChevronDown
                            className={cn(
                                'size-4 transition-transform',
                                advanced && 'rotate-180'
                            )}
                        />
                    </button>
                    {advanced ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="export-pattern"
                                    className="mt-0.5"
                                    checked={pattern}
                                    onCheckedChange={(v) =>
                                        setPattern(v === true)
                                    }
                                />
                                <div className="grid gap-1">
                                    <Label htmlFor="export-pattern">
                                        {t('editor.exporting.image.pattern')}
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                        {t(
                                            'editor.exporting.image.patternHelp'
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <Checkbox
                                    id="export-transparent"
                                    className="mt-0.5"
                                    checked={transparent}
                                    onCheckedChange={(v) =>
                                        setTransparent(v === true)
                                    }
                                />
                                <div className="grid gap-1">
                                    <Label htmlFor="export-transparent">
                                        {t(
                                            'editor.exporting.image.transparent'
                                        )}
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                        {t(
                                            'editor.exporting.image.transparentHelp'
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {format === 'jpeg' && transparent ? (
                        <p className="text-xs text-muted-foreground">
                            {t('editor.exporting.image.jpegNote')}
                        </p>
                    ) : null}
                </fieldset>
                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={busy}
                    >
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
