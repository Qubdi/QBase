import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Table } from 'lucide-react';
import { hidesEverything } from '@/features/filters/filter-tree';
import { cn } from '@/lib/utils/utils';
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
import { WindowedList } from './windowed-list';

/** The Tables section (EDT-102 to EDT-111). */
export const TablesSection: React.FC = () => {
    const { design, filter, showViews, locked, edit } = useEditorEnv();
    const text = useText();
    const store = useEditorStoreApi();
    const expanded = useEditorStore(selectPanel).expandedEntityId;
    const [filterText, setFilterText] = useState('');
    // one row is open at a time; a table opened from the canvas opens here too
    const [openId, setOpenId] = useState<string | undefined>(expanded);
    const [seenExpanded, setSeenExpanded] = useState(expanded);
    if (expanded !== seenExpanded) {
        setSeenExpanded(expanded);
        if (expanded) setOpenId(expanded);
    }

    // a table added from here opens its form at once
    const knownIds = useRef(new Set(design.entities.order));
    const justAdded = useRef(false);
    const { add, dialog } = useAddTable(() => {
        justAdded.current = true;
        setFilterText('');
    });
    useEffect(() => {
        const fresh = design.entities.order.filter(
            (id) => !knownIds.current.has(id)
        );
        knownIds.current = new Set(design.entities.order);
        if (justAdded.current && fresh.length > 0) {
            justAdded.current = false;
            setOpenId(fresh[fresh.length - 1]);
        }
    }, [design.entities.order]);
    const rows = listTables({ design, filter, showViews, text: filterText });
    const everything = design.entities.order.length;
    const showSchema = visibleSchemas(design, filter, showViews).length > 1;

    const addButton = locked ? null : (
        <div className="flex shrink-0">
            <Button
                type="button"
                size="sm"
                variant="secondary"
                className={cn('px-2', showViews && 'rounded-r-none')}
                onClick={() => add('table')}
                {...newItemDragProps('table')}
            >
                <Table />
                {text('tables.add')}
            </Button>
            {showViews ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-l-none border-l border-border px-1.5"
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

    const emptyAdd = locked ? null : (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="px-4 text-sm"
            onClick={() => add('table')}
        >
            {text('tables.add')}
        </Button>
    );

    let body: React.ReactNode;
    if (everything === 0) {
        body = (
            <Notice
                title={text('tables.empty')}
                hint={text('tables.emptyHint')}
            >
                {emptyAdd}
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
                    <WindowedList
                        items={rows}
                        getId={(r) => r.id}
                        keepIds={[openId]}
                        scrollToId={openId}
                        renderItem={(entity) => (
                            <TableRow
                                entity={entity}
                                open={openId === entity.id}
                                sortable
                                showSchema={showSchema}
                                onToggle={() =>
                                    setOpenId(
                                        openId === entity.id
                                            ? undefined
                                            : entity.id
                                    )
                                }
                            />
                        )}
                    />
                </div>
            </SortableList>
        );
    }

    return (
        <div className="flex h-full flex-col gap-1 px-2 py-1">
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
            <div data-window-root className="min-h-0 flex-1 overflow-y-auto">
                {body}
            </div>
            {dialog}
        </div>
    );
};
