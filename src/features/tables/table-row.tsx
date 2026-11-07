import React, { useEffect, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronRight,
    Crosshair,
    MoreHorizontal,
} from 'lucide-react';
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
import { SortableRow } from '@/platform/panel/sortable-list';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
    const view = entity.kind === 'view';
    const hasSchemas = traitsOf(design.databaseType).hasSchemas;

    useEffect(() => {
        if (open) root.current?.scrollIntoView?.({ block: 'nearest' });
    }, [open]);

    const header = (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
                type="button"
                aria-expanded={open}
                aria-label={text('tables.toggle')}
                onClick={onToggle}
                className="flex size-7 shrink-0 items-center justify-center"
            >
                {open ? (
                    <ChevronDown className="size-4" />
                ) : (
                    <ChevronRight className="size-4" />
                )}
            </button>
            <span
                className={cn(
                    'size-2.5 shrink-0 rounded-full border',
                    view && 'bg-transparent'
                )}
                style={
                    view
                        ? { borderColor: entity.color }
                        : { backgroundColor: entity.color }
                }
            />
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
        <div ref={root} className="rounded-md border" data-testid="table-row">
            <div {...hold}>
                <SortableRow
                    id={entity.id}
                    disabled={!sortable || locked}
                    handleLabel={text('common.dragHandle')}
                    className="p-1"
                >
                    {header}
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        aria-label={text('common.focus')}
                        onClick={() => focus(entity.id)}
                    >
                        <Crosshair />
                    </Button>
                    <DropdownMenu {...menu}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label={text('tables.actions')}
                            >
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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
                </SortableRow>
            </div>
            {open ? (
                <div className="border-t p-2">
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
