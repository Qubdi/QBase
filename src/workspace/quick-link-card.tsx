import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionSelect } from '@/components/option-select/option-select';
import { columnsOf, entityOf } from '@/core/model/lookup';
import { commitQuickLink, suggestTarget } from '@/canvas/link-draft';
import type { TargetChoice } from '@/canvas/link-draft';
import { useClampedPlacement } from '@/canvas/use-clamped';
import { escapeIsFree } from '@/canvas/keyboard';
import type { LinkCardProps } from '@/canvas/hooks';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { useEditorStoreApi } from '@/store/store-context';

const NEW = '__new__';

/**
 * The small card that finishes a table-to-table relationship (EDT-158 to
 * EDT-162): the source key is fixed, the target is a field of the second table
 * or a new one. Create makes the field and the link as one undo step.
 */
export const QuickLinkCard: React.FC<LinkCardProps> = ({
    sourceEntityId,
    targetEntityId,
    anchor,
    done,
}) => {
    const { t } = useTranslation();
    const store = useEditorStoreApi();
    const design = store.getState().design;
    const source = entityOf(design, sourceEntityId);
    const target = entityOf(design, targetEntityId);
    const suggestion = useMemo(
        () => suggestTarget(design, sourceEntityId, targetEntityId),
        [design, sourceEntityId, targetEntityId]
    );
    const [pick, setPick] = useState(
        suggestion?.choice.kind === 'existing'
            ? suggestion.choice.columnId
            : NEW
    );
    const [name, setName] = useState(
        suggestion?.choice.kind === 'new' ? suggestion.choice.name : ''
    );
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && escapeIsFree(e)) done();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [done]);
    const card = useRef<HTMLDivElement>(null);
    const place = useClampedPlacement(card, anchor);
    const [error, setError] = useState<'noKey' | 'noField' | 'noLink'>();
    if (!source || !target) return null;
    const key = suggestion
        ? design.columns[suggestion.sourceColumnId]
        : undefined;
    const fields = columnsOf(design, target);

    const create = () => {
        const choice: TargetChoice =
            pick === NEW
                ? { kind: 'new', name }
                : { kind: 'existing', columnId: pick };
        const plan = commitQuickLink(
            store,
            sourceEntityId,
            targetEntityId,
            choice
        );
        if (plan.ok) done(plan.linkId);
        else
            setError(
                plan.error === 'no-key'
                    ? 'noKey'
                    : plan.error === 'no-field'
                      ? 'noField'
                      : 'noLink'
            );
    };

    return (
        <div
            ref={card}
            role="dialog"
            aria-label={t('editor.workspace.canvas.link.title')}
            className="fixed z-40 w-72 max-w-[calc(100vw-1rem)] space-y-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
            style={{ left: place.left, top: place.top }}
        >
            <h3 className="font-semibold">
                {t('editor.workspace.canvas.link.title')}
            </h3>
            {key ? (
                <p className="text-muted-foreground">
                    {t('editor.workspace.canvas.link.from', {
                        table: source.name,
                        field: key.name,
                    })}
                </p>
            ) : null}
            <OptionSelect
                aria-label={t('editor.workspace.canvas.link.target', {
                    table: target.name,
                })}
                size="sm"
                value={pick}
                onValueChange={setPick}
                options={[
                    ...fields.map((c) => ({ value: c.id, label: c.name })),
                    {
                        value: NEW,
                        label: t('editor.workspace.canvas.link.newField'),
                    },
                ]}
            />
            {pick === NEW ? (
                <Input
                    aria-label={t('editor.workspace.canvas.link.newFieldName')}
                    className="h-8"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            ) : null}
            {error ? (
                <p role="alert" className="text-xs text-destructive">
                    {t(`editor.workspace.canvas.link.${error}`)}
                </p>
            ) : null}
            <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => done()}>
                    {t('editor.workspace.canvas.link.cancel')}
                </Button>
                <Button size="sm" onClick={create}>
                    {t('editor.workspace.canvas.link.create')}
                </Button>
            </div>
        </div>
    );
};
