import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { DiagramIcon } from '@/components/diagram-icon/diagram-icon';
import type { DatabaseType } from '@/core/model/database';
import { listDialects } from '@/dialects/registry';
import {
    createBlankDesign,
    nextNumber,
    storeNewDesign,
} from '@/features/designs/design-service';
import { useDesignList } from '@/features/designs/use-design-list';
import { ImportBox } from '@/features/import/import-box';
import type { ImportBoxState } from '@/features/import/import-box';
import { useDialog } from '@/hooks/use-dialog';
import { cn } from '@/lib/utils/utils';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useOptionalEditorStoreApi } from '@/store/store-context';
import '@/i18n/editor/register';

export interface CreateDiagramDialogProps {
    dialog: { open: boolean };
}

/**
 * New diagram, local mode, in two steps: pick the database, then either
 * create it empty or paste something to import. With no diagram open behind
 * it the dialog cannot be dismissed (spec A5).
 */
export const CreateDiagramDialog: React.FC<CreateDiagramDialogProps> = ({
    dialog,
}) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const adapter = useStorageAdapter();
    const store = useOptionalEditorStoreApi();
    const canClose = store !== null;
    const { closeCreateDiagramDialog, openImportDiagramDialog } = useDialog();
    const { items } = useDesignList(adapter, dialog.open);

    const [step, setStep] = useState<'type' | 'import'>('type');
    const [type, setType] = useState<DatabaseType | undefined>();
    const [box, setBox] = useState<ImportBoxState | undefined>();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();

    // every opening starts again from the first step
    useEffect(() => {
        if (!dialog.open) return;
        setStep('type');
        setType(undefined);
        setBox(undefined);
        setProblem(undefined);
    }, [dialog.open]);

    const number = nextNumber(items?.length ?? 0);
    const defaultName = t('editor.designs.defaultName', { number });
    const onBox = useCallback((state: ImportBoxState) => setBox(state), []);

    const finish = async (make: () => Promise<{ id: string }>) => {
        setBusy(true);
        setProblem(undefined);
        try {
            const { id } = await make();
            closeCreateDiagramDialog();
            navigate(`/diagrams/${id}`);
        } catch {
            setProblem(t('editor.designs.create.failed'));
        } finally {
            setBusy(false);
        }
    };

    const createEmpty = () =>
        type &&
        finish(() =>
            createBlankDesign(adapter, { databaseType: type, defaultName })
        );

    const importDesign = () => {
        const design = box?.analysis.design;
        if (!design) return;
        return finish(async () => {
            await storeNewDesign(adapter, design);
            return design;
        });
    };

    const canImport =
        !!box?.analysis.design &&
        !box.analysis.blocked &&
        !box.pending &&
        !busy;

    return (
        <Dialog
            open={dialog.open}
            onOpenChange={(open) => {
                if (!open && canClose && !busy) closeCreateDiagramDialog();
            }}
        >
            <DialogContent
                className="max-w-3xl"
                showClose={canClose}
                onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
                onInteractOutside={(e) => !canClose && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>
                        {step === 'type'
                            ? t('editor.designs.create.titleType')
                            : t('editor.designs.create.titleImport')}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'type'
                            ? t('editor.designs.create.descriptionType')
                            : t('editor.designs.create.descriptionImport')}
                    </DialogDescription>
                </DialogHeader>

                {step === 'type' ? (
                    <div
                        role="radiogroup"
                        aria-label={t('editor.designs.create.titleType')}
                        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                    >
                        {listDialects().map((d) => (
                            <button
                                key={d.id}
                                type="button"
                                role="radio"
                                aria-checked={type === d.id}
                                onClick={() => {
                                    setType(d.id);
                                    setStep('import');
                                }}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent',
                                    type === d.id && 'border-primary bg-accent'
                                )}
                            >
                                <DiagramIcon
                                    databaseType={d.id}
                                    className="size-8"
                                />
                                <span className="font-medium">{d.label}</span>
                            </button>
                        ))}
                    </div>
                ) : type ? (
                    <ImportBox
                        databaseType={type}
                        diagramName={defaultName}
                        onChange={onBox}
                    />
                ) : null}

                {problem ? (
                    <p role="alert" className="text-sm text-destructive">
                        {problem}
                    </p>
                ) : null}

                <DialogFooter className="gap-2 sm:justify-between">
                    <div className="flex gap-2">
                        {step === 'import' ? (
                            <Button
                                variant="outline"
                                onClick={() => setStep('type')}
                                disabled={busy}
                            >
                                {t('editor.common.back')}
                            </Button>
                        ) : canClose ? (
                            <Button
                                variant="outline"
                                onClick={closeCreateDiagramDialog}
                            >
                                {t('editor.common.cancel')}
                            </Button>
                        ) : null}
                        {step === 'type' ? (
                            <Button
                                variant="ghost"
                                onClick={openImportDiagramDialog}
                            >
                                {t('editor.designs.create.fromFile')}
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            disabled={!type || busy}
                            onClick={() => void createEmpty()}
                        >
                            {step === 'type'
                                ? t('editor.designs.create.empty')
                                : t('editor.designs.create.emptyFromImport')}
                        </Button>
                        {step === 'type' ? (
                            <Button
                                disabled={!type || busy}
                                onClick={() => setStep('import')}
                            >
                                {t('editor.common.continue')}
                            </Button>
                        ) : (
                            <Button
                                disabled={!canImport}
                                onClick={() => void importDesign()}
                            >
                                {t('editor.designs.create.import')}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
