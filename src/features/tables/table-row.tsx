import React, { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Crosshair, MoreVertical } from 'lucide-react';
import { ChevronDownIcon } from '@/platform/ui/radix-icons';
import {
    planChangeSchema,
    planDeleteEntities,
    planDuplicateEntity,
} from '@/core/commands/plan-entity';
import { planAddColumn } from '@/core/commands/plan-column';
import { planAddKey } from '@/core/commands/plan-column';
import { traitsOf } from '@/core/model/database';
import type { Entity } from '@/core/model/entity';
import { cn } from '@/lib/utils/utils';
import { InlineName } from '@/platform/panel/inline-name';
import { useHoldMenu } from '@/platform/panel/hold-menu';
import { useFocus } from '@/platform/panel/panel-context';
import { SortableHandle } from '@/platform/panel/sortable-list';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { EntityForm } from './entity-form';
import { ChangeSchemaDialog } from './schema-dialogs';
import { knownSchemas } from './table-list';

/** One row of the Tables list: its header, and the editor when it is open (EDT-103 to EDT-111). */
export const TableRow: React.FC<{
    entity: Entity;
    open: boolean;
    onToggle: () => void;
    showSchema: boolean;
    sortable: boolean;
}> = ({ entity, open, onToggle, showSchema, sortable }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const focus = useFocus();
    const [changing, setChanging] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const { menu, hold } = useHoldMenu();
    const dragOff = !sortable || locked;
    const {
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
        attributes,
        listeners,
    } = useSortable({ id: entity.id, disabled: dragOff });
    const view = entity.kind === 'view';
    const hasSchemas = traitsOf(design.databaseType).hasSchemas;

    useEffect(() => {
        if (open) root.current?.scrollIntoView?.({ block: 'nearest' });
    }, [open]);

    const reveal =
        'size-8 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';

    const chevron = (
        <button
            type="button"
            aria-expanded={open}
            aria-label={`${text('tables.toggle')}: ${entity.name}`}
            onClick={onToggle}
            className="flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <ChevronDownIcon
                className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                    open && 'rotate-180'
                )}
            />
        </button>
    );

    const header = (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            {view ? (
                <span
                    className="size-2.5 shrink-0 rounded-full border bg-transparent"
                    style={{ borderColor: entity.color }}
                />
            ) : null}
            <InlineName
                value={entity.name}
                readOnly={locked}
                hint={text('tables.doubleClickToEdit')}
                editLabel={text('tables.renameTable')}
                className="text-sm font-medium"
                onActivate={onToggle}
                onSave={(name) =>
                    edit({
                        type: 'entity.update',
                        id: entity.id,
                        patch: { name },
                    })
                }
                actions={
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={reveal}
                        aria-label={text('common.focus')}
                        onClick={() => focus(entity.id)}
                    >
                        <Crosshair />
                    </Button>
                }
            >
                {showSchema && entity.schema ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                        ({entity.schema})
                    </span>
                ) : null}
                {view ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 text-[10px]">
                        {text('tables.viewTag')}
                    </span>
                ) : null}
            </InlineName>
        </div>
    );

    return (
        // The whole card is what moves while it is dragged, so the other tables
        // make room for it live and none of them is cut off by the card's edge.
        <div
            ref={(node) => {
                root.current = node;
                setNodeRef(node);
            }}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
            className={cn(
                'relative overflow-hidden rounded-[10px] border bg-card',
                isDragging && 'z-10 opacity-80 shadow-md'
            )}
            data-testid="table-row"
        >
            <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1"
                style={{ backgroundColor: entity.color }}
            />
            <div {...hold}>
                <div
                    className={cn(
                        'group flex h-11 items-center gap-1 pl-3 pr-1 hover:bg-accent/70',
                        open && 'bg-accent/70'
                    )}
                >
                    {chevron}
                    {dragOff ? null : (
                        <SortableHandle
                            label={text('common.dragHandle')}
                            activatorRef={setActivatorNodeRef}
                            attributes={attributes}
                            listeners={listeners}
                        />
                    )}
                    {header}
                    <DropdownMenu {...menu}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                aria-label={text('tables.actions')}
                            >
                                <MoreVertical />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                {text('tables.actions')}
                            </DropdownMenuLabel>
                            {hasSchemas && !locked ? (
                                <DropdownMenuItem
                                    onSelect={() => setChanging(true)}
                                >
                                    {text('tables.changeSchema')}
                                </DropdownMenuItem>
                            ) : null}
                            {locked ? null : (
                                <DropdownMenuItem
                                    onSelect={() =>
                                        edit(planAddColumn(design, entity.id))
                                    }
                                >
                                    {text('tables.addField')}
                                </DropdownMenuItem>
                            )}
                            {locked || view ? null : (
                                <DropdownMenuItem
                                    onSelect={() =>
                                        edit(planAddKey(design, entity.id))
                                    }
                                >
                                    {text('tables.addIndex')}
                                </DropdownMenuItem>
                            )}
                            {locked ? null : (
                                <DropdownMenuItem
                                    onSelect={() =>
                                        edit(
                                            planDuplicateEntity(
                                                design,
                                                entity.id
                                            )
                                        )
                                    }
                                >
                                    {text('tables.duplicate')}
                                </DropdownMenuItem>
                            )}
                            {locked ? null : (
                                <DropdownMenuItem
                                    onSelect={() =>
                                        edit(planDeleteEntities([entity.id]))
                                    }
                                >
                                    {text('tables.delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            {open ? (
                <div className="pl-1">
                    <EntityForm entity={entity} />
                </div>
            ) : null}
            {changing ? (
                <ChangeSchemaDialog
                    tableName={entity.name}
                    current={entity.schema}
                    schemas={knownSchemas(design)}
                    onCancel={() => setChanging(false)}
                    onChange={(schema) => {
                        edit(planChangeSchema(entity.id, schema));
                        setChanging(false);
                    }}
                />
            ) : null}
        </div>
    );
};
