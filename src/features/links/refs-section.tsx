import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree, Waypoints } from 'lucide-react';
import { planDeleteDependency } from '@/core/commands/plan-dependency';
import {
    planDeleteLink,
    planSetCardinality,
    planSwitchLink,
} from '@/core/commands/plan-link';
import type { CardinalityChoice } from '@/core/commands/plan-link';
import type { Dependency } from '@/core/model/dependency';
import type { Link } from '@/core/model/link';
import { OptionSelect } from '@/components/option-select/option-select';
import { Notice } from '@/platform/panel/notice';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { WindowedList } from '@/features/tables/windowed-list';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';
import { CreateLinkDialog } from './create-link-dialog';
import { cardinalityChoiceOf, listDependencies, listRefs } from './link-rules';

const RefRow: React.FC<{
    link: Link;
    open: boolean;
    onToggle: () => void;
}> = ({ link, open, onToggle }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const store = useEditorStoreApi();
    const source = design.entities.byId[link.sourceEntityId];
    const target = design.entities.byId[link.targetEntityId];
    const sourceField = design.columns[link.sourceColumnId];
    const targetField = design.columns[link.targetColumnId];
    const choice = cardinalityChoiceOf(link);

    const rows: [string, string][] = [
        [text('refs.primaryTable'), source?.name ?? ''],
        [text('refs.primaryField'), sourceField?.name ?? ''],
        [text('refs.relatedTable'), target?.name ?? ''],
        [text('refs.relatedField'), targetField?.name ?? ''],
    ];

    return (
        <div className="rounded-[10px] border bg-card" data-testid="ref-row">
            <button
                type="button"
                aria-expanded={open}
                className={`flex min-h-11 w-full items-center gap-1 rounded-[10px] px-2 text-left text-sm font-medium hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${open ? 'bg-accent/70' : ''}`}
                onClick={() => {
                    store.getState().select([link.id]);
                    onToggle();
                }}
            >
                {open ? (
                    <ChevronDown className="size-4 shrink-0" />
                ) : (
                    <ChevronRight className="size-4 shrink-0" />
                )}
                <span className="truncate">{link.name}</span>
            </button>
            {open ? (
                <div className="space-y-2 border-t p-2 text-sm">
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                        {rows.map(([label, value]) => (
                            <React.Fragment key={label}>
                                <dt className="text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="truncate">{value}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                    <div className="space-y-1">
                        <span className="text-muted-foreground">
                            {text('refs.cardinality')}
                        </span>
                        <OptionSelect
                            aria-label={text('refs.cardinality')}
                            value={choice}
                            disabled={locked}
                            onValueChange={(v) =>
                                edit(
                                    planSetCardinality(
                                        link,
                                        v as CardinalityChoice
                                    )
                                )
                            }
                            options={[
                                {
                                    value: 'one-to-one',
                                    label: text('refs.oneToOne'),
                                },
                                {
                                    value: 'one-to-many',
                                    label: text('refs.oneToMany'),
                                },
                                ...(choice === 'many-to-one'
                                    ? [
                                          {
                                              value: 'many-to-one',
                                              label: text('refs.manyToOne'),
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                    </div>
                    {locked ? null : (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => edit(planSwitchLink(link))}
                            >
                                {text('refs.switchTables')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => edit(planDeleteLink(link.id))}
                            >
                                {text('refs.delete')}
                            </Button>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
};

const DependencyRow: React.FC<{ dependency: Dependency }> = ({
    dependency,
}) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const store = useEditorStoreApi();
    const table = design.entities.byId[dependency.tableId];
    const view = design.entities.byId[dependency.dependentTableId];
    const selected = useEditorStore((s) =>
        s.ui.selection.includes(dependency.id)
    );
    return (
        <div
            className={`space-y-2 rounded-[10px] border bg-card p-2 text-sm ${selected ? 'ring-2 ring-primary' : ''}`}
            data-testid="dependency-row"
        >
            <button
                type="button"
                className="block w-full truncate text-left font-medium"
                onClick={() => store.getState().select([dependency.id])}
            >
                {table?.name ?? ''}
            </button>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">
                    {text('refs.dependencyTable')}
                </dt>
                <dd className="truncate">{table?.name ?? ''}</dd>
                <dt className="text-muted-foreground">
                    {text('refs.dependentView')}
                </dt>
                <dd className="truncate">{view?.name ?? ''}</dd>
            </dl>
            {locked ? null : (
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => edit(planDeleteDependency(dependency.id))}
                >
                    {text('refs.delete')}
                </Button>
            )}
        </div>
    );
};

/** The Refs section (EDT-178 to EDT-186): relationships, then dependencies. */
export const RefsSection: React.FC = () => {
    const { design, filter, showViews, locked } = useEditorEnv();
    const text = useText();
    const [filterText, setFilterText] = useState('');
    const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
    // a line chosen on the canvas ("Open in sidebar") opens its row
    const chosen = useEditorStore((s) => s.ui.selection.join(' '));
    useEffect(() => {
        const ids = chosen.split(' ').filter((id) => design.links.byId[id]);
        if (ids.length === 0) return;
        setOpenIds((now) =>
            ids.every((id) => now.has(id)) ? now : new Set([...now, ...ids])
        );
        // only a change of the selection opens rows; closing one stays closed
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chosen]);
    const [creating, setCreating] = useState(false);
    const links = listRefs({ design, filter, showViews, text: filterText });
    const dependencies = listDependencies({
        design,
        filter,
        showViews,
        text: filterText,
    });

    const toggle = (id: string) =>
        setOpenIds((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
        });

    let body: React.ReactNode;
    if (design.links.order.length === 0 && design.dependencies.length === 0) {
        body = (
            <Notice title={text('refs.empty')} hint={text('refs.emptyHint')}>
                {locked ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-4 text-sm"
                        onClick={() => setCreating(true)}
                    >
                        {text('refs.add')}
                    </Button>
                )}
            </Notice>
        );
    } else if (links.length === 0 && dependencies.length === 0) {
        body = <Notice title={text('refs.noMatch')} />;
    } else {
        body = (
            <div className="space-y-3">
                {links.length > 0 ? (
                    <div className="space-y-1">
                        <h3 className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {text('refs.relationships')}
                        </h3>
                        <WindowedList
                            items={links}
                            getId={(l) => l.id}
                            keepIds={[...openIds]}
                            renderItem={(link) => (
                                <RefRow
                                    link={link}
                                    open={openIds.has(link.id)}
                                    onToggle={() => toggle(link.id)}
                                />
                            )}
                        />
                    </div>
                ) : null}
                {dependencies.length > 0 ? (
                    <div className="space-y-1" data-testid="dependencies">
                        <h3 className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {text('refs.dependencies')}
                        </h3>
                        <WindowedList
                            items={dependencies}
                            getId={(d) => d.id}
                            renderItem={(dep) => (
                                <DependencyRow dependency={dep} />
                            )}
                        />
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-2 p-2">
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={text('refs.collapseAll')}
                    onClick={() => setOpenIds(new Set())}
                >
                    <ListTree />
                </Button>
                <Input
                    aria-label={text('refs.filter')}
                    placeholder={text('refs.filter')}
                    className="h-8 min-w-0 flex-1"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
                {locked ? null : (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="shrink-0 px-2"
                        onClick={() => setCreating(true)}
                    >
                        <Waypoints />
                        {text('refs.add')}
                    </Button>
                )}
            </div>
            <div data-window-root className="min-h-0 flex-1 overflow-y-auto">
                {body}
            </div>
            {creating ? (
                <CreateLinkDialog
                    onClose={() => setCreating(false)}
                    onCreated={(id) => setOpenIds((s) => new Set(s).add(id))}
                />
            ) : null}
        </div>
    );
};
