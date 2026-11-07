import React from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DebouncedInput } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { Button } from '@/platform/ui/button';
import { EntityForm } from '@/features/tables/entity-form';
import type { Id } from '@/core/model/id';

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
    const entity = design.entities.byId[entityId];
    if (!entity) return null;
    return (
        <div
            role="group"
            aria-label={t('editor.workspace.canvas.editTable', {
                name: entity.name,
            })}
            className="w-[22rem] max-w-[90vw] space-y-3 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
        >
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
                    aria-label={t('editor.workspace.canvas.done')}
                    onClick={close}
                >
                    <Check />
                </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
                <EntityForm entity={entity} />
            </div>
        </div>
    );
};
