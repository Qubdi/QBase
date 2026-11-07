import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Spinner } from '@/platform/ui/spinner';
import { Textarea } from '@/platform/ui/textarea';
import { toast } from '@/platform/toast/use-toast';
import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { exportSql } from '@/formats/sql/export-sql';
import { useEditorStore } from '@/store/store-context';
import { downloadText, safeFileName } from './download-file';
import '@/i18n/editor/register';

export interface ExportSqlDialogProps {
    /** the target database; undefined keeps the dialog closed */
    target?: DatabaseType;
    onClose: () => void;
}

/** SQL of the open diagram for a target database, with copy and download. */
export const ExportSqlDialog: React.FC<ExportSqlDialogProps> = ({
    target,
    onClose,
}) => {
    const { t } = useTranslation();
    const design = useEditorStore((s) => s.design);
    const filter = useEditorStore((s) => s.ui.filter);
    const [ready, setReady] = useState(false);

    // a spinner for a moment, as the script is written (EXP-004)
    useEffect(() => {
        setReady(false);
        if (!target) return;
        const timer = setTimeout(() => setReady(true), 0);
        return () => clearTimeout(timer);
    }, [target]);

    const result = useMemo(
        () =>
            target && ready ? exportSql(design, target, { filter }) : undefined,
        [design, filter, target, ready]
    );
    const problem = result?.diagnostics.find((d) => d.severity === 'error');
    const label = target ? dialectFor(target).label : '';

    const copy = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.text);
            toast({ title: t('editor.exporting.sql.copied') });
        } catch {
            toast({
                title: t('editor.exporting.sql.copyFailed'),
                variant: 'destructive',
            });
        }
    };

    return (
        <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.exporting.sql.title', { database: label })}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.exporting.sql.description')}
                    </DialogDescription>
                </DialogHeader>
                {!result ? (
                    <div className="flex h-48 items-center justify-center">
                        <Spinner size="large" />
                    </div>
                ) : problem ? (
                    <p
                        role="alert"
                        className="rounded-md border border-destructive/40 p-4 text-sm text-destructive"
                    >
                        {problem.message === 'Nothing to export'
                            ? t('editor.exporting.sql.nothing')
                            : problem.message}
                    </p>
                ) : (
                    <Textarea
                        readOnly
                        value={result.text}
                        aria-label={t('editor.exporting.sql.script')}
                        className="h-96 resize-none font-mono text-xs"
                        spellCheck={false}
                    />
                )}
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose}>
                        {t('editor.common.close')}
                    </Button>
                    <Button
                        variant="secondary"
                        disabled={!result || !!problem}
                        onClick={() => void copy()}
                    >
                        <Copy /> {t('editor.exporting.sql.copy')}
                    </Button>
                    <Button
                        disabled={!result || !!problem}
                        onClick={() =>
                            result &&
                            downloadText(
                                result.text,
                                `${safeFileName(design.name)}.sql`,
                                'application/sql'
                            )
                        }
                    >
                        <Download /> {t('editor.exporting.sql.download')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
