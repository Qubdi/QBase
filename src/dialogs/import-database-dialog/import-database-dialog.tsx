import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { ImportHelp } from '@/features/import/import-help';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { toast } from '@/platform/toast/use-toast';
import { isVisible, tidyFilter } from '@/core/model/visibility-filter';
import { traitsOf } from '@/core/model/database';
import type { ImportIntoOpenOptions } from '@/context/dialog-context/dialog-context';
import { ImportBox } from '@/features/import/import-box';
import type { ImportBoxState } from '@/features/import/import-box';
import { mergeImported } from '@/features/import/merge-into-design';
import { useDialog } from '@/hooks/use-dialog';
import { selectFilter } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { diagnosticText } from '@/lib/diagnostic-text';

export interface ImportDatabaseDialogProps {
    dialog: { open: boolean } & ImportIntoOpenOptions;
}

/**
 * Adds tables from pasted SQL, DBML or metadata to the open diagram (spec 8.1,
 * 16.2). The database type is the diagram's. New tables land 150 px right of
 * the existing ones; a table that exists again is added and reported.
 */
export const ImportDatabaseDialog: React.FC<ImportDatabaseDialogProps> = ({
    dialog,
}) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const { closeImportDatabaseDialog } = useDialog();
    const databaseType = useEditorStore((s) => s.design.databaseType);
    const [box, setBox] = useState<ImportBoxState | undefined>();

    // every opening starts with an empty box
    const [wasOpen, setWasOpen] = useState(dialog.open);
    if (wasOpen !== dialog.open) {
        setWasOpen(dialog.open);
        if (dialog.open) setBox(undefined);
    }
    const onBox = useCallback((state: ImportBoxState) => setBox(state), []);

    const imported = box?.analysis.design;
    const merge = useMemo(
        () =>
            imported
                ? mergeImported(store.getState().design, imported, 0)
                : undefined,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is read once per analysis, so the summary matches what is applied; `dialog.open` only re-reads it
        [imported, store, dialog.open]
    );
    const canApply =
        !!merge &&
        !box?.analysis.blocked &&
        !box?.pending &&
        merge.addedEntities > 0;

    const apply = () => {
        if (!imported) return;
        const state = store.getState();
        const fresh = mergeImported(state.design, imported, Date.now());
        const result = state.replaceDesign(fresh.design, { history: 'reset' });
        if (!result.ok) {
            toast({
                title: t('editor.importing.into.failed'),
                description: diagnosticText(result.message),
                variant: 'destructive',
            });
            return;
        }
        state.markDirty();
        // the new tables must not be hidden by a filter the person set earlier
        const filter = selectFilter(store.getState());
        const defaultSchema = traitsOf(fresh.design.databaseType).defaultSchema;
        const added = imported.entities.order;
        const hidden = added.filter(
            (id) =>
                !isVisible(
                    filter,
                    fresh.design.entities.byId[id],
                    defaultSchema
                )
        );
        if (hidden.length > 0) {
            const widened = {
                ...filter,
                tableIds: [...(filter.tableIds ?? []), ...hidden],
            };
            const entities = fresh.design.entities.order.map(
                (id) => fresh.design.entities.byId[id]
            );
            store
                .getState()
                .setFilter(tidyFilter(widened, entities, defaultSchema));
        }
        toast({
            title: t('editor.importing.into.done', {
                count: fresh.addedEntities,
            }),
        });
        closeImportDatabaseDialog();
    };

    return (
        <Dialog
            open={dialog.open}
            onOpenChange={(open) => !open && closeImportDatabaseDialog()}
        >
            <DialogContent className="max-w-[900px]">
                <DialogHeader>
                    <DialogTitle>
                        {t('editor.importing.into.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('editor.importing.into.description')}
                    </DialogDescription>
                </DialogHeader>
                <ImportBox
                    databaseType={databaseType}
                    methods={dialog.methods}
                    initialMethod={dialog.initial}
                    onChange={onBox}
                />
                {merge && canApply ? (
                    <div
                        className="rounded-md border bg-muted/40 p-3 text-sm"
                        data-testid="import-summary"
                    >
                        <p>
                            {t('editor.importing.into.newTables', {
                                count: merge.addedEntities,
                            })}
                        </p>
                        <p>
                            {t('editor.importing.into.newLinks', {
                                count: merge.addedLinks,
                            })}
                        </p>
                        {merge.addedTypes > 0 ? (
                            <p>
                                {t('editor.importing.into.newTypes', {
                                    count: merge.addedTypes,
                                })}
                            </p>
                        ) : null}
                        {merge.duplicates.length > 0 ? (
                            <p role="note" className="mt-1 text-amber-600">
                                {t('editor.importing.into.duplicates', {
                                    names: merge.duplicates.join(', '),
                                })}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <DialogFooter className="gap-4 sm:justify-between sm:space-x-0">
                    <ImportHelp />
                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            onClick={closeImportDatabaseDialog}
                        >
                            {t('editor.common.close')}
                        </Button>
                        <Button disabled={!canApply} onClick={apply}>
                            {t('editor.importing.into.apply')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
