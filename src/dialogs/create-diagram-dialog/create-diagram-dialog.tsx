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
import type { DatabaseType } from '@/core/model/database';
import {
    createBlankDesign,
    nextNumber,
    storeNewDesign,
} from '@/features/designs/design-service';
import { useDesignList } from '@/features/designs/use-design-list';
import { ExamplesGrid } from '@/features/examples/examples-grid';
import type { Example } from '@/features/examples/examples';
import { buildExample } from '@/features/examples/build-example';
import { ImportHelp } from '@/features/import/import-help';
import { ImportBox } from '@/features/import/import-box';
import type { ImportBoxState } from '@/features/import/import-box';
import { useDialog } from '@/hooks/use-dialog';
import { useStorageAdapter } from '@/qbase/storage-context';
import { useOptionalEditorStoreApi } from '@/store/store-context';
import { DatabasePicker } from './database-picker';

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

    const [step, setStep] = useState<'type' | 'import' | 'examples'>('type');
    const [type, setType] = useState<DatabaseType | undefined>('generic');
    const [box, setBox] = useState<ImportBoxState | undefined>();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();

    // every opening starts again from the first step
    useEffect(() => {
        if (!dialog.open) return;
        setStep('type');
        setType('generic');
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

    const openExample = (example: Example) =>
        finish(async () => {
            const built = await buildExample(example.domain);
            if ('problem' in built) throw new Error(built.problem);
            await storeNewDesign(adapter, built.design);
            return built.design;
        });

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
                className="max-w-[900px]"
                showClose={canClose}
                onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
                onInteractOutside={(e) => !canClose && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>
                        {step === 'type'
                            ? t('editor.designs.create.titleType')
                            : step === 'examples'
                              ? t('editor.designs.create.titleExamples')
                              : t('editor.designs.create.titleImport')}
                    </DialogTitle>
                    <DialogDescription
                        className={step === 'import' ? 'sr-only' : ''}
                    >
                        {step === 'type'
                            ? t('editor.designs.create.descriptionType')
                            : step === 'examples'
                              ? t('editor.designs.create.descriptionExamples')
                              : t('editor.designs.create.descriptionImport')}
                    </DialogDescription>
                </DialogHeader>

                {step === 'type' ? (
                    <DatabasePicker
                        value={type}
                        onPick={(picked) => {
                            setType(picked);
                            setStep('import');
                        }}
                        onGeneric={() => setType('generic')}
                        onExamples={() => setStep('examples')}
                    />
                ) : step === 'examples' ? (
                    <ExamplesGrid disabled={busy} onPick={openExample} />
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

                <DialogFooter className="gap-4 sm:justify-between sm:space-x-0">
                    <div className="flex gap-2 max-sm:flex-col">
                        {step !== 'type' ? (
                            <Button
                                variant="secondary"
                                onClick={() => setStep('type')}
                                disabled={busy}
                            >
                                {t('editor.common.back')}
                            </Button>
                        ) : canClose ? (
                            <Button
                                variant="secondary"
                                onClick={closeCreateDiagramDialog}
                            >
                                {t('editor.common.cancel')}
                            </Button>
                        ) : null}
                        {step === 'import' ? <ImportHelp /> : null}
                        {step === 'type' && !canClose ? (
                            <Button
                                variant="ghost"
                                onClick={openImportDiagramDialog}
                            >
                                {t('editor.designs.create.fromFile')}
                            </Button>
                        ) : null}
                    </div>
                    {step === 'examples' ? null : (
                        <div className="flex gap-4 max-sm:flex-col-reverse">
                            <Button
                                variant="outline"
                                disabled={!type || busy}
                                onClick={() => void createEmpty()}
                            >
                                {step === 'type'
                                    ? t('editor.designs.create.empty')
                                    : t(
                                          'editor.designs.create.emptyFromImport'
                                      )}
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
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
