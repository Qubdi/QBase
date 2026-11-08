import React from 'react';
import { CircleDotDashed, Plus, Table2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DebouncedInput } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { FieldsEditor } from '@/features/tables/fields/fields-editor';
import { ColorPicker } from '@/components/color-picker/color-picker';
import { planAddColumn } from '@/core/commands/plan-column';
import { planChangeSchema } from '@/core/commands/plan-entity';
import { traitsOf } from '@/core/model/database';
import { hasDuplicateName, knownSchemas } from '@/features/tables/table-list';
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
                className="h-7"
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
            className="h-7 px-2"
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
    const text = useText();
    const { design, locked, edit } = useEditorEnv();
    const store = useEditorStoreApi();
    const [addedId, setAddedId] = React.useState<string | undefined>();
    const entity = design.entities.byId[entityId];
    if (!entity) return null;
    const hasSchemas = traitsOf(design.databaseType).hasSchemas;
    return (
        <div
            role="group"
            aria-label={t('editor.workspace.canvas.editTable', {
                name: entity.name,
            })}
            className="w-[350px] max-w-[90vw] overflow-hidden rounded-xl border border-primary bg-card text-card-foreground shadow-lg ring-2 ring-primary/25"
        >
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b bg-gradient-to-b from-primary/10 to-transparent px-3">
                <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ background: entity.color }}
                >
                    <Table2 className="size-4" />
                </span>
                {hasSchemas && entity.kind !== 'view' ? (
                    <div className="w-20 shrink-0">
                        <SchemaBox
                            entityId={entity.id}
                            schema={entity.schema}
                            locked={locked}
                        />
                    </div>
                ) : null}
                <DebouncedInput
                    required
                    aria-label={t('editor.workspace.canvas.tableName')}
                    value={entity.name}
                    readOnly={locked}
                    delay={1000}
                    className="h-7 min-w-0 flex-1 text-sm font-semibold"
                    onCommit={(name) =>
                        edit({
                            type: 'entity.update',
                            id: entity.id,
                            patch: { name },
                        })
                    }
                />
                <div className="flex shrink-0 flex-row gap-1">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0 text-muted-foreground"
                        aria-label={t('editor.workspace.canvas.openInPanel')}
                        onClick={() =>
                            store.getState().showEntityInPanel(entity.id)
                        }
                    >
                        <CircleDotDashed />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 shrink-0 text-muted-foreground"
                        aria-label={t('editor.workspace.canvas.done')}
                        onClick={close}
                    >
                        <X />
                    </Button>
                </div>
            </div>
            {hasDuplicateName(design, entity) ? (
                <p role="alert" className="px-3 pt-1 text-xs text-amber-700">
                    {text('tables.duplicateName', { name: entity.name })}
                </p>
            ) : null}
            <div className="max-h-[60vh] overflow-y-auto px-1.5 py-1">
                <FieldsEditor entity={entity} addedId={addedId} compact />
            </div>
            <div className="flex h-[49px] shrink-0 items-center justify-between border-t bg-muted/30 px-3">
                <div className="flex items-center gap-2">
                    {entity.kind === 'view' ? null : (
                        <ColorPicker
                            color={entity.color}
                            disabled={locked}
                            className="h-6 w-8"
                            onChange={(color) =>
                                edit({
                                    type: 'entity.update',
                                    id: entity.id,
                                    patch: { color },
                                })
                            }
                        />
                    )}
                    {locked ? null : (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => {
                                const command = planAddColumn(
                                    design,
                                    entity.id
                                );
                                if (command?.type === 'part.insert')
                                    setAddedId(command.item.id);
                                edit(command);
                            }}
                        >
                            <Plus />
                            {text('fields.add')}
                        </Button>
                    )}
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.workspace.canvas.fieldCount', {
                        count: entity.columnIds.length,
                    })}
                </span>
            </div>
        </div>
    );
};
