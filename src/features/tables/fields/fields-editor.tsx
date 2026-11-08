import React, { useRef, useState } from 'react';
import { Key, MessageSquareText, Plus } from 'lucide-react';
import {
    planAddColumn,
    planDeleteColumn,
    planReorderColumns,
    planUpdateColumn,
} from '@/core/commands/plan-column';
import { isSerialType } from '@/core/commands/settle-column';
import { listOf } from '@/core/model/collection';
import type { Entity } from '@/core/model/entity';
import { columnsOf, linksOfColumn } from '@/core/model/lookup';
import { cn } from '@/lib/utils/utils';
import { DebouncedInput } from '@/platform/panel/debounced-input';
import { SortableList, SortableRow } from '@/platform/panel/sortable-list';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { toast } from '@/platform/toast/use-toast';
import { Button } from '@/platform/ui/button';
import { AttributesPopover } from './attributes-popover';
import { planPickType, reorderedIds } from './field-rules';
import { TypePicker } from './type-picker';

const Toggle: React.FC<{
    label: string;
    pressed: boolean;
    disabled?: boolean;
    onClick: () => void;
    tone?: 'plain' | 'key';
    children: React.ReactNode;
}> = ({ label, pressed, disabled, onClick, tone = 'plain', children }) => (
    <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        className={cn(
            'size-7 shrink-0 text-xs text-slate-600 dark:text-slate-400',
            pressed && 'bg-accent text-accent-foreground',
            pressed && tone === 'key' && 'text-orange-700 dark:text-orange-400'
        )}
        onClick={onClick}
    >
        {children}
    </Button>
);

/** The fields of one table in the side panel (EDT-117 to EDT-139). */
export const FieldsEditor: React.FC<{
    entity: Entity;
    /** a field added from outside (the form footer) that should take the focus */
    addedId?: string;
    /** told the id of a field added with the button of this editor */
    onAdded?: (id: string) => void;
}> = ({ entity, addedId, onAdded }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const columns = columnsOf(design, entity);
    const userTypes = listOf(design.userTypes);
    const [popoverFor, setPopoverFor] = useState<string | undefined>();
    const added = useRef<string | undefined>(undefined);

    const update = (
        id: string,
        patch: Parameters<typeof planUpdateColumn>[2]
    ) => edit(planUpdateColumn(entity.id, id, patch));

    return (
        <div className="space-y-1">
            <SortableList
                ids={entity.columnIds}
                disabled={locked}
                onMove={(a, b) => {
                    const ids = reorderedIds(entity.columnIds, a, b);
                    if (ids) edit(planReorderColumns(entity.id, ids));
                }}
            >
                {columns.map((column) => (
                    <SortableRow
                        key={column.id}
                        id={column.id}
                        disabled={locked}
                        handleLabel={text('common.dragHandle')}
                    >
                        <div
                            className={cn(
                                'flex min-w-0 flex-1 items-center gap-1',
                                (addedId ?? added.current) === column.id &&
                                    'bg-sky-100/60'
                            )}
                        >
                            <DebouncedInput
                                aria-label={text('fields.name')}
                                className="h-8 min-w-[3.5rem] flex-1 px-2 text-sm"
                                value={column.name}
                                required
                                readOnly={locked}
                                focusOnMount={
                                    (addedId ?? added.current) === column.id
                                }
                                placeholder={text('fields.namePlaceholder')}
                                onCommit={(name) => update(column.id, { name })}
                            />
                            {column.comments ? (
                                <button
                                    type="button"
                                    aria-label={text('fields.showComment')}
                                    title={column.comments}
                                    onClick={() => setPopoverFor(column.id)}
                                    className="text-muted-foreground"
                                >
                                    <MessageSquareText className="size-4" />
                                </button>
                            ) : null}
                            <TypePicker
                                databaseType={design.databaseType}
                                userTypes={userTypes}
                                column={column}
                                disabled={locked}
                                onPick={(option, declaration) =>
                                    edit(
                                        planPickType(
                                            design.databaseType,
                                            entity,
                                            column,
                                            option,
                                            declaration
                                        )
                                    )
                                }
                            />
                            <Toggle
                                label={text('fields.nullable')}
                                pressed={column.nullable}
                                disabled={
                                    locked ||
                                    column.primaryKey ||
                                    isSerialType(column.type.id)
                                }
                                onClick={() =>
                                    update(column.id, {
                                        nullable: !column.nullable,
                                    })
                                }
                            >
                                {text('fields.nullableShort')}
                            </Toggle>
                            {entity.kind === 'view' ? null : (
                                <Toggle
                                    label={text('fields.primaryKey')}
                                    pressed={column.primaryKey}
                                    tone="key"
                                    disabled={locked}
                                    onClick={() =>
                                        update(column.id, {
                                            primaryKey: !column.primaryKey,
                                        })
                                    }
                                >
                                    <Key className="size-4" />
                                </Toggle>
                            )}
                            <AttributesPopover
                                databaseType={design.databaseType}
                                column={column}
                                columns={columns}
                                readOnly={locked}
                                open={popoverFor === column.id}
                                onOpenChange={(open) =>
                                    setPopoverFor(open ? column.id : undefined)
                                }
                                onChange={(patch) => update(column.id, patch)}
                                onDelete={() => {
                                    setPopoverFor(undefined);
                                    // relationships on the field go with it (EDT-139)
                                    const lost = linksOfColumn(
                                        design,
                                        entity.id,
                                        column.id
                                    ).length;
                                    edit(
                                        planDeleteColumn(entity.id, column.id)
                                    );
                                    if (lost > 0)
                                        toast({
                                            title: text('fields.linksRemoved', {
                                                count: lost,
                                            }),
                                        });
                                }}
                            />
                        </div>
                    </SortableRow>
                ))}
            </SortableList>
            {columns.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                    {text('fields.none')}
                </p>
            ) : null}
            {locked ? null : (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                        const command = planAddColumn(design, entity.id);
                        if (command?.type === 'part.insert') {
                            added.current = command.item.id;
                            onAdded?.(command.item.id);
                        }
                        edit(command);
                    }}
                >
                    <Plus />
                    {text('fields.add')}
                </Button>
            )}
        </div>
    );
};
