import React, { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { hidesEverything } from '@/features/filters/filter-tree';
import { Notice } from '@/platform/panel/notice';
import { SortableList } from '@/platform/panel/sortable-list';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { Input } from '@/platform/ui/input';
import { selectPanel } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { TableRow } from './table-row';
import { listTables, planReorderTables, visibleSchemas } from './table-list';
import { newItemDragProps } from '@/canvas/drop-items';
import { useAddTable } from './use-add-table';

/** The Tables section (EDT-102 to EDT-111). */
export const TablesSection: React.FC = () => {
    const { design, filter, showViews, locked, edit } = useEditorEnv();
    const text = useText();
    const store = useEditorStoreApi();
    const expanded = useEditorStore(selectPanel).expandedEntityId;
    const [filterText, setFilterText] = useState('');
    // one row is open at a time; a table opened from the canvas opens here too
    const [openId, setOpenId] = useState<string | undefined>(expanded);
    useEffect(() => {
        if (expanded) setOpenId(expanded);
    }, [expanded]);

    const { add, dialog } = useAddTable(() => setFilterText(''));
    const rows = listTables({ design, filter, showViews, text: filterText });
    const everything = design.entities.order.length;
    const showSchema = visibleSchemas(design, filter, showViews).length > 1;

    const addButton = locked ? null : (
        <div className="flex shrink-0">
            <Button
                type="button"
                size="sm"
                className={showViews ? 'rounded-r-none' : undefined}
                onClick={() => add('table')}
                {...newItemDragProps('table')}
            >
                <Plus />
                {text('tables.add')}
            </Button>
            {showViews ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            size="sm"
                            className="rounded-l-none border-l border-primary-foreground/30 px-1.5"
                            aria-label={text('tables.addMenu')}
                        >
                            <ChevronDown />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onSelect={() => add('view')}
                            {...newItemDragProps('view')}
                        >
                            {text('tables.addView')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </div>
    );

    let body: React.ReactNode;
    if (everything === 0) {
        body = (
            <Notice
                title={text('tables.empty')}
                hint={text('tables.emptyHint')}
            >
                {addButton}
            </Notice>
        );
    } else if (hidesEverything(design, filter)) {
        body = (
            <Notice title={text('tables.allHidden')}>
                <Button
                    type="button"
                    size="sm"
                    onClick={() => store.getState().setFilter({})}
                >
                    {text('tables.showAll')}
                </Button>
            </Notice>
        );
    } else if (rows.length === 0 && filterText) {
        body = (
            <Notice title={text('tables.noMatch')}>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFilterText('')}
                >
                    {text('common.clearFilter')}
                </Button>
            </Notice>
        );
    } else {
        body = (
            <SortableList
                ids={rows.map((r) => r.id)}
                disabled={locked}
                onMove={(a, b) => edit(planReorderTables(design, a, b))}
            >
                <div className="space-y-1">
                    {rows.map((entity) => (
                        <TableRow
                            key={entity.id}
                            entity={entity}
                            open={openId === entity.id}
                            sortable
                            showSchema={showSchema}
                            onToggle={() =>
                                setOpenId(
                                    openId === entity.id ? undefined : entity.id
                                )
                            }
                        />
                    ))}
                </div>
            </SortableList>
        );
    }

    return (
        <div className="flex h-full flex-col gap-2 p-2">
            <div className="flex items-center gap-2">
                <Input
                    aria-label={text('common.filter')}
                    placeholder={text('common.filter')}
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="h-8"
                />
                {addButton}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
            {dialog}
        </div>
    );
};
