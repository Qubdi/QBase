import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Search, X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Notice } from '@/platform/panel/notice';
import { useFocus } from '@/platform/panel/panel-context';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { useEditorStoreApi } from '@/store/store-context';
import { buildTree, setTableShown, setTablesShown } from './filter-tree';
import type { GroupBy } from './filter-tree';
import type { Id } from '@/core/model/id';

const ToggleEye: React.FC<{
    shown: boolean;
    label: string;
    onClick: () => void;
}> = ({ shown, label, onClick }) => (
    <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        aria-label={label}
        aria-pressed={shown}
        onClick={onClick}
    >
        {shown ? <Eye /> : <EyeOff />}
    </Button>
);

/**
 * The floating Filter Tables panel (EDT-061 to EDT-073): a search box, a
 * schema/area switch and a tree with an eye on every group and table. Choices
 * are written to the store's filter; the canvas refits when it changes.
 * `onZoomToGroup` lets the canvas show several tables at once.
 */
export const FilterPanel: React.FC<{
    onClose: () => void;
    onZoomToGroup?: (tableIds: Id[]) => void;
}> = ({ onClose, onZoomToGroup }) => {
    const { design, filter, showViews } = useEditorEnv();
    const text = useText();
    const store = useEditorStoreApi();
    const focus = useFocus();
    const [search, setSearch] = useState('');
    const [groupBy, setGroupBy] = useState<GroupBy>('schema');
    const box = useRef<HTMLInputElement>(null);
    useEffect(() => box.current?.focus(), []);
    // Escape closes the panel unless a list or popover inside it took the key
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) onClose();
        };
        document.addEventListener('keydown', key);
        return () => document.removeEventListener('keydown', key);
    }, [onClose]);

    const tree = buildTree({
        design,
        filter,
        groupBy,
        text: search,
        showViews,
    });
    const set = (next: ReturnType<typeof setTableShown>) =>
        store.getState().setFilter(next);

    return (
        <div
            role="dialog"
            aria-label={text('filters.title')}
            className="flex max-h-[70vh] w-72 flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
        >
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                    {text('filters.title')}
                </h3>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    aria-label={text('common.close')}
                    onClick={onClose}
                >
                    <X />
                </Button>
            </div>
            <div className="relative">
                <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
                <Input
                    ref={box}
                    aria-label={text('filters.search')}
                    placeholder={text('filters.search')}
                    className="h-8 pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="flex gap-1" role="group">
                {(['schema', 'area'] as const).map((mode) => (
                    <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={groupBy === mode ? 'default' : 'outline'}
                        aria-pressed={groupBy === mode}
                        className="h-7 flex-1 text-xs"
                        onClick={() => setGroupBy(mode)}
                    >
                        {text(
                            mode === 'schema'
                                ? 'filters.groupBySchema'
                                : 'filters.groupByArea'
                        )}
                    </Button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {tree.length === 0 ? (
                    design.entities.order.length === 0 ? (
                        <Notice
                            title={text('filters.noTables')}
                            hint={text('filters.createToStart')}
                        />
                    ) : (
                        <Notice
                            title={text('filters.noTables')}
                            hint={text('filters.tryAdjusting')}
                        >
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setSearch('')}
                            >
                                {text('common.clearFilter')}
                            </Button>
                        </Notice>
                    )
                ) : (
                    tree.map((group) => (
                        <div key={group.key} data-testid="filter-group">
                            {group.named || tree.length > 1 ? (
                                <div className="flex items-center gap-1 py-1">
                                    <ToggleEye
                                        shown={group.shown !== 'none'}
                                        label={`${group.shown === 'none' ? text('filters.show') : text('filters.hide')} ${
                                            group.label ||
                                            text(
                                                groupBy === 'schema'
                                                    ? 'filters.noSchema'
                                                    : 'filters.noArea'
                                            )
                                        }`}
                                        onClick={() =>
                                            set(
                                                setTablesShown(
                                                    design,
                                                    filter,
                                                    group.tables.map(
                                                        (t) => t.entity.id
                                                    ),
                                                    group.shown === 'none'
                                                )
                                            )
                                        }
                                    />
                                    <span
                                        className={cn(
                                            'flex-1 truncate text-xs font-semibold',
                                            group.shown === 'none' &&
                                                'text-muted-foreground'
                                        )}
                                    >
                                        {group.label ||
                                            text(
                                                groupBy === 'schema'
                                                    ? 'filters.noSchema'
                                                    : 'filters.noArea'
                                            )}
                                    </span>
                                    {onZoomToGroup ? (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="size-6"
                                            aria-label={text('filters.zoomTo', {
                                                name: group.label,
                                            })}
                                            onClick={() =>
                                                onZoomToGroup(
                                                    group.tables.map(
                                                        (t) => t.entity.id
                                                    )
                                                )
                                            }
                                        >
                                            <ZoomIn />
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                            {group.tables.map(({ entity, shown }) => (
                                <div
                                    key={entity.id}
                                    data-testid="filter-table"
                                    className="flex items-center gap-1 pl-3"
                                >
                                    <ToggleEye
                                        shown={shown}
                                        label={`${shown ? text('filters.hide') : text('filters.show')} ${entity.name}`}
                                        onClick={() =>
                                            set(
                                                setTableShown(
                                                    design,
                                                    filter,
                                                    entity.id,
                                                    !shown
                                                )
                                            )
                                        }
                                    />
                                    <button
                                        type="button"
                                        className={cn(
                                            'flex-1 truncate py-1 text-left text-sm hover:underline',
                                            !shown && 'text-muted-foreground'
                                        )}
                                        onClick={() => {
                                            if (!shown)
                                                set(
                                                    setTableShown(
                                                        design,
                                                        filter,
                                                        entity.id,
                                                        true
                                                    )
                                                );
                                            focus(entity.id);
                                        }}
                                    >
                                        {entity.name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
