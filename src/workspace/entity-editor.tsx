import React from 'react';
import { Check, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DebouncedInput } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { Button } from '@/platform/ui/button';
import { EntityForm } from '@/features/tables/entity-form';
import { planChangeSchema } from '@/core/commands/plan-entity';
import { traitsOf } from '@/core/model/database';
import { knownSchemas } from '@/features/tables/table-list';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/platform/ui/input';
import { useEditorStoreApi } from '@/store/store-context';
import type { Id } from '@/core/model/id';

const NEW_SCHEMA = '__new_schema__';

/** The schema box of the card: a drop-down, and a text box for a new schema (EDT-095). */
const SchemaBox: React.FC<{
    entityId: Id;
    schema: string | undefined;
    locked: boolean;
}> = ({ entityId, schema, locked }) => {
    const { t } = useTranslation();
    const { design, edit } = useEditorEnv();
    const [creating, setCreating] = React.useState(false);
    const [typed, setTyped] = React.useState('');
    const known = knownSchemas(design);
    const current = schema?.trim()
        ? schema
        : (traitsOf(design.databaseType).defaultSchema ?? '');
    const names =
        known.includes(current) || !current ? known : [...known, current];
    if (creating)
        return (
            <Input
                ref={(el) => el?.focus()}
                aria-label={t('editor.workspace.canvas.newSchemaName')}
                placeholder={t('editor.workspace.canvas.newSchemaName')}
                className="h-8"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && typed.trim() !== '') {
                        edit(planChangeSchema(entityId, typed.trim()));
                        setCreating(false);
                        setTyped('');
                    } else if (e.key === 'Escape') {
                        setCreating(false);
                        setTyped('');
                    }
                }}
            />
        );
    return (
        <OptionSelect
            size="sm"
            aria-label={t('editor.workspace.canvas.schema')}
            value={current}
            disabled={locked}
            onValueChange={(value) => {
                if (value === NEW_SCHEMA) setCreating(true);
                else edit(planChangeSchema(entityId, value));
            }}
            options={[
                ...names.map((s) => ({ value: s, label: s })),
                {
                    value: NEW_SCHEMA,
                    label: t('editor.workspace.canvas.createSchema'),
                },
            ]}
        />
    );
};

/**
 * The form that replaces a table's card on the canvas while it is edited
 * in place (EDT-084 to EDT-092): the name, then the same editors the side
 * panel shows. Every change is one edit through the store.
 */
export const EntityEditor: React.FC<{ entityId: Id; close(): void }> = ({
    entityId,
    close,
}) => {
    const { t } = useTranslation();
    const { design, locked, edit } = useEditorEnv();
    const store = useEditorStoreApi();
    const entity = design.entities.byId[entityId];
    if (!entity) return null;
    const hasSchemas = traitsOf(design.databaseType).hasSchemas;
    return (
        <div
            role="group"
            aria-label={t('editor.workspace.canvas.editTable', {
                name: entity.name,
            })}
            className="w-[26rem] max-w-[90vw] space-y-3 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
        >
            {hasSchemas && entity.kind !== 'view' ? (
                <SchemaBox
                    entityId={entity.id}
                    schema={entity.schema}
                    locked={locked}
                />
            ) : null}
            <div className="flex items-center gap-2">
                <DebouncedInput
                    required
                    aria-label={t('editor.workspace.canvas.tableName')}
                    value={entity.name}
                    readOnly={locked}
                    delay={1000}
                    className="h-8 flex-1 font-semibold"
                    onCommit={(name) =>
                        edit({
                            type: 'entity.update',
                            id: entity.id,
                            patch: { name },
                        })
                    }
                />
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t('editor.workspace.canvas.openInPanel')}
                    onClick={() =>
                        store.getState().showEntityInPanel(entity.id)
                    }
                >
                    <PanelRight />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={t('editor.workspace.canvas.done')}
                    onClick={close}
                >
                    <Check />
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                {t('editor.workspace.canvas.fieldCount', {
                    count: entity.columnIds.length,
                })}
            </p>
            <div className="max-h-[60vh] overflow-y-auto">
                <EntityForm entity={entity} />
            </div>
        </div>
    );
};
