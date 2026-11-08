import React, { useRef, useState } from 'react';
import { KeyRound, MessageSquareText, Plus, Trash } from 'lucide-react';
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
    /** the 32px square of the canvas card */
    compact?: boolean;
    children: React.ReactNode;
}> = ({
    label,
    pressed,
    disabled,
    onClick,
    tone = 'plain',
    compact,
    children,
}) => (
    <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        className={cn(
            'shrink-0 text-xs',
            compact
                ? 'size-8 text-muted-foreground'
                : 'size-7 text-slate-600 dark:text-slate-400',
            pressed &&
                (compact
                    ? 'bg-accent text-orange-600 dark:text-orange-400'
                    : 'bg-accent text-accent-foreground'),
            pressed &&
                !compact &&
                tone === 'key' &&
                'text-orange-700 dark:text-orange-400'
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
    /**
     * The canvas card's rows: no box around the name or the type, a delete
     * button where the side panel has the attributes menu, and no add button
     * (the card has its own in its footer).
     */
    compact?: boolean;
}> = ({ entity, addedId, onAdded, compact }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const columns = columnsOf(design, entity);
    const userTypes = listOf(design.userTypes);
    const [popoverFor, setPopoverFor] = useState<string | undefined>();
    const added = useRef<string | undefined>(undefined);

    const removeColumn = (id: string) => {
        setPopoverFor(undefined);
        // relationships on the field go with it (EDT-139)
        const lost = linksOfColumn(design, entity.id, id).length;
        edit(planDeleteColumn(entity.id, id));
        if (lost > 0)
            toast({
                title: text('fields.linksRemoved', { count: lost }),
            });
    };

    const update = (
        id: string,
        patch: Parameters<typeof planUpdateColumn>[2]
    ) => edit(planUpdateColumn(entity.id, id, patch));

    return (
        <div className={compact ? undefined : 'space-y-1'}>
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
                        className={
                            compact
                                ? 'group/row relative h-9 gap-0 rounded-md px-1.5'
                                : undefined
                        }
                        handleClassName={
                            compact
                                ? 'absolute -left-1 z-10 h-6 w-3 bg-card opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100'
                                : undefined
                        }
                    >
                        <div
                            className={cn(
                                'flex min-w-0 flex-1 items-center gap-1',
                                compact && 'gap-2',
                                (addedId ?? added.current) === column.id &&
                                    'bg-sky-100/60'
                            )}
                        >
                            <div
                                className={
                                    compact
                                        ? 'flex min-w-0 flex-1 items-center gap-1'
                                        : 'contents'
                                }
                            >
                                <DebouncedInput
                                    aria-label={text('fields.name')}
                                    className={cn(
                                        'h-8 min-w-[3.5rem] flex-1 text-sm',
                                        compact
                                            ? 'border-transparent bg-transparent px-3 font-medium shadow-none hover:border-input'
                                            : 'px-2'
                                    )}
                                    value={column.name}
                                    required
                                    readOnly={locked}
                                    focusOnMount={
                                        (addedId ?? added.current) === column.id
                                    }
                                    placeholder={text('fields.namePlaceholder')}
                                    onCommit={(name) =>
                                        update(column.id, { name })
                                    }
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
                                    compact={compact}
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
                            </div>
                            <div
                                className={
                                    compact
                                        ? 'flex shrink-0 items-center justify-end gap-1'
                                        : 'contents'
                                }
                            >
                                <Toggle
                                    label={text('fields.nullable')}
                                    pressed={column.nullable}
                                    compact={compact}
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
                                        compact={compact}
                                        disabled={locked}
                                        onClick={() =>
                                            update(column.id, {
                                                primaryKey: !column.primaryKey,
                                            })
                                        }
                                    >
                                        <KeyRound
                                            className={
                                                compact ? 'h-3.5 w-4' : 'size-4'
                                            }
                                        />
                                    </Toggle>
                                )}
                                {compact ? (
                                    locked ? null : (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label={text('fields.delete')}
                                            className="size-8 shrink-0 text-red-700 dark:text-red-400"
                                            onClick={() =>
                                                removeColumn(column.id)
                                            }
                                        >
                                            <Trash className="h-3.5 w-4" />
                                        </Button>
                                    )
                                ) : (
                                    <AttributesPopover
                                        databaseType={design.databaseType}
                                        column={column}
                                        columns={columns}
                                        readOnly={locked}
                                        open={popoverFor === column.id}
                                        onOpenChange={(open) =>
                                            setPopoverFor(
                                                open ? column.id : undefined
                                            )
                                        }
                                        onChange={(patch) =>
                                            update(column.id, patch)
                                        }
                                        onDelete={() => removeColumn(column.id)}
                                    />
                                )}
                            </div>
                        </div>
                    </SortableRow>
                ))}
            </SortableList>
            {columns.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                    {text('fields.none')}
                </p>
            ) : null}
            {locked || compact ? null : (
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
