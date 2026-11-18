import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    ChevronDown,
    ChevronRight,
    Database,
    Eye,
    EyeOff,
    List,
    Search,
    Table2,
    X,
    ZoomIn,
} from 'lucide-react';
import { shortcutLabel } from '@/canvas/keyboard';
import type { Column } from '@/core/model/column';
import type { Entity } from '@/core/model/entity';
import { typeLabel } from '@/core/model/type-suffix';
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
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={label}
        aria-pressed={shown}
        onClick={onClick}
    >
        {shown ? <Eye /> : <EyeOff />}
    </Button>
);

/** How many matching fields a table shows before "Show n more". */
const FIELD_LIMIT = 3;

/** The text with every part that matches the search marked (ignoring case). */
const Marked: React.FC<{ value: string; needle: string }> = ({
    value,
    needle,
}) => {
    const low = value.toLowerCase();
    const find = needle.toLowerCase();
    const parts: React.ReactNode[] = [];
    let from = 0;
    for (
        let at = find ? low.indexOf(find) : -1;
        at >= 0;
        at = low.indexOf(find, from)
    ) {
        parts.push(value.slice(from, at));
        from = at + find.length;
        parts.push(
            <mark
                key={at}
                className="rounded-[2px] bg-yellow-200 px-px text-inherit dark:bg-yellow-700/60"
            >
                {value.slice(at, from)}
            </mark>
        );
    }
    parts.push(value.slice(from));
    return <>{parts}</>;
};

/**
 * The floating Search & Filter panel (EDT-061 to EDT-073): a search box that
 * finds tables by their name and by the names of their fields, a schema/area
 * switch and a tree with an eye on every group and table. The fields that match
 * are listed under their table; a click on one shows the table, centres it and
 * focuses the field on the canvas. Choices are written to the store's filter;
 * the canvas refits when it changes. `onZoomToGroup` lets the canvas show
 * several tables at once.
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
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    // the tables that show all their matching fields, not just the first few
    const [allFields, setAllFields] = useState<ReadonlySet<Id>>(new Set());
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
    const needle = search.trim();
    // a field found: its table is shown if hidden, selected and centred, and the
    // field is focused, as when its row is clicked on the canvas card
    const openField = (entity: Entity, field: Column, shown: boolean) => {
        if (!shown) set(setTableShown(design, filter, entity.id, true));
        focus(entity.id);
        store
            .getState()
            .setFocusColumn({ entityId: entity.id, columnId: field.id });
    };

    return (
        <div
            role="dialog"
            aria-label={text('filters.title')}
            className="flex h-full max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-[10px] border bg-popover text-popover-foreground shadow-md"
        >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{text('filters.title')}</span>
                    <span className="text-xs font-normal text-primary">
                        ({shortcutLabel(['Mod', 'F'])})
                    </span>
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
            <div className="p-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        ref={box}
                        aria-label={text('filters.search')}
                        placeholder={text('filters.search')}
                        className="h-9 border-2 pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex gap-1 border-y px-2 py-2" role="group">
                {(['schema', 'area'] as const).map((mode) => (
                    <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-pressed={groupBy === mode}
                        className={cn(
                            'h-9 flex-1 text-xs',
                            groupBy === mode &&
                                'bg-accent text-accent-foreground'
                        )}
                        onClick={() => setGroupBy(mode)}
                    >
                        {mode === 'schema' ? <Database /> : <Box />}
                        {text(
                            mode === 'schema'
                                ? 'filters.groupBySchema'
                                : 'filters.groupByArea'
                        )}
                    </Button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                    tree.map((group) => {
                        const groupName =
                            group.label ||
                            text(
                                groupBy === 'schema'
                                    ? 'filters.noSchema'
                                    : 'filters.noArea'
                            );
                        const framed = group.named || tree.length > 1;
                        const isOpen = !framed || !collapsed.has(group.key);
                        const shownCount = group.tables.filter(
                            (t) => t.shown
                        ).length;
                        return (
                            <div key={group.key} data-testid="filter-group">
                                {framed ? (
                                    <div className="flex items-center gap-1 py-1">
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="size-6 shrink-0"
                                            aria-expanded={isOpen}
                                            aria-label={groupName}
                                            onClick={() =>
                                                setCollapsed((now) => {
                                                    const next = new Set(now);
                                                    if (!next.delete(group.key))
                                                        next.add(group.key);
                                                    return next;
                                                })
                                            }
                                        >
                                            {isOpen ? (
                                                <ChevronDown />
                                            ) : (
                                                <ChevronRight />
                                            )}
                                        </Button>
                                        {groupBy === 'schema' ? (
                                            <Database className="size-3.5 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <Box className="size-3.5 shrink-0 text-muted-foreground" />
                                        )}
                                        <span
                                            className={cn(
                                                'truncate text-xs',
                                                group.shown === 'none' &&
                                                    'text-muted-foreground'
                                            )}
                                        >
                                            {groupName}
                                        </span>
                                        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                                            {shownCount}/{group.tables.length}
                                        </span>
                                        <span className="flex-1" />
                                        {onZoomToGroup ? (
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="size-6"
                                                aria-label={text(
                                                    'filters.zoomTo',
                                                    {
                                                        name: group.label,
                                                    }
                                                )}
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
                                        <ToggleEye
                                            shown={group.shown !== 'none'}
                                            label={`${group.shown === 'none' ? text('filters.show') : text('filters.hide')} ${groupName}`}
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
                                    </div>
                                ) : null}
                                {isOpen
                                    ? group.tables.map(
                                          ({ entity, shown, fields }) => (
                                              <React.Fragment key={entity.id}>
                                                  <div
                                                      data-testid="filter-table"
                                                      className={cn(
                                                          'flex items-center gap-1',
                                                          framed
                                                              ? 'pl-8'
                                                              : 'pl-1'
                                                      )}
                                                  >
                                                      <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                                                      <button
                                                          type="button"
                                                          className={cn(
                                                              'flex-1 truncate rounded-sm py-1 text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                              !shown &&
                                                                  'text-muted-foreground'
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
                                                  </div>
                                                  {fields.length > 0 ? (
                                                      <div
                                                          data-testid="filter-fields"
                                                          className={
                                                              framed
                                                                  ? 'pl-[3.25rem]'
                                                                  : 'pl-6'
                                                          }
                                                      >
                                                          {(allFields.has(
                                                              entity.id
                                                          )
                                                              ? fields
                                                              : fields.slice(
                                                                    0,
                                                                    FIELD_LIMIT
                                                                )
                                                          ).map((field) => (
                                                              <button
                                                                  key={field.id}
                                                                  type="button"
                                                                  aria-label={text(
                                                                      'filters.focusField',
                                                                      {
                                                                          table: entity.name,
                                                                          field: field.name,
                                                                      }
                                                                  )}
                                                                  className={cn(
                                                                      'flex h-7 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-[13px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                                                                      !shown &&
                                                                          'text-muted-foreground'
                                                                  )}
                                                                  onClick={() =>
                                                                      openField(
                                                                          entity,
                                                                          field,
                                                                          shown
                                                                      )
                                                                  }
                                                              >
                                                                  <List className="size-3 shrink-0 text-muted-foreground" />
                                                                  <span className="min-w-0 flex-1 truncate">
                                                                      <Marked
                                                                          value={
                                                                              field.name
                                                                          }
                                                                          needle={
                                                                              needle
                                                                          }
                                                                      />
                                                                  </span>
                                                                  <span className="shrink-0 text-[11px] text-muted-foreground">
                                                                      {typeLabel(
                                                                          field,
                                                                          design.databaseType
                                                                      )}
                                                                  </span>
                                                              </button>
                                                          ))}
                                                          {fields.length >
                                                          FIELD_LIMIT ? (
                                                              <button
                                                                  type="button"
                                                                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                                  onClick={() =>
                                                                      setAllFields(
                                                                          (
                                                                              now
                                                                          ) => {
                                                                              const next =
                                                                                  new Set(
                                                                                      now
                                                                                  );
                                                                              if (
                                                                                  !next.delete(
                                                                                      entity.id
                                                                                  )
                                                                              )
                                                                                  next.add(
                                                                                      entity.id
                                                                                  );
                                                                              return next;
                                                                          }
                                                                      )
                                                                  }
                                                              >
                                                                  {allFields.has(
                                                                      entity.id
                                                                  )
                                                                      ? text(
                                                                            'filters.showFewerFields'
                                                                        )
                                                                      : text(
                                                                            'filters.showMoreFields',
                                                                            {
                                                                                count:
                                                                                    fields.length -
                                                                                    FIELD_LIMIT,
                                                                            }
                                                                        )}
                                                              </button>
                                                          ) : null}
                                                      </div>
                                                  ) : null}
                                              </React.Fragment>
                                          )
                                      )
                                    : null}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
