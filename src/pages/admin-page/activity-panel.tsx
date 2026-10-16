import React, { useMemo, useState } from 'react';
import { ChevronsUpDown, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { OptionSelect } from '@/components/option-select/option-select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { UserPicker } from '@/components/qubdi/user-picker';
import { useCursorList } from '@/hooks/use-cursor-list';
import {
    ACTIVITY_GROUP_OPTIONS,
    describeActivity,
    endOfDay,
    groupByDay,
    startOfDay,
    type Segment,
} from '@/lib/qubdi/activity';
import { api, type ActivityGroup, type ActivityItem } from '@/lib/qubdi/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;
const NO_USERS: ReadonlySet<string> = new Set();

interface Named {
    id: string;
    label: string;
}

const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });

/** The sentence for one row. The person and the diagram narrow the list when chosen. */
const Sentence: React.FC<{
    item: ActivityItem;
    onPerson: (person: Named) => void;
    onDiagram: (diagram: Named) => void;
    /** already narrowed to this person or diagram: nothing more to choose */
    activeUserId?: string;
    activeDiagramId?: string;
}> = ({ item, onPerson, onDiagram, activeUserId, activeDiagramId }) => {
    const piece = (s: Segment, i: number) => {
        if (s.kind === 'gone') {
            return (
                <span key={i} className="italic text-muted-foreground">
                    {s.text}
                </span>
            );
        }
        if (s.kind === 'text') return <span key={i}>{s.text}</span>;

        const { userId, diagramId } = s;
        const choose =
            userId && userId !== activeUserId
                ? () => onPerson({ id: userId, label: s.text })
                : diagramId && diagramId !== activeDiagramId
                  ? () => onDiagram({ id: diagramId, label: s.text })
                  : null;
        if (!choose) {
            return (
                <span key={i} className="break-words font-medium">
                    {s.text}
                </span>
            );
        }
        return (
            <button
                key={i}
                type="button"
                title={
                    s.userId
                        ? `Show only what ${s.text} did`
                        : `Show only the activity on ${s.text}`
                }
                className="break-words rounded-sm text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={choose}
            >
                {s.text}
            </button>
        );
    };
    return <span>{describeActivity(item).map(piece)}</span>;
};

/** Who did what and when, newest first, with filters and "Load more". */
export const ActivityPanel: React.FC = () => {
    const [group, setGroup] = useState<'' | ActivityGroup>('');
    const [person, setPerson] = useState<Named | null>(null);
    const [diagram, setDiagram] = useState<Named | null>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [showSaves, setShowSaves] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const list = useCursorList<ActivityItem>(
        (cursor) =>
            api.adminListActivity({
                limit: PAGE_SIZE,
                cursor,
                group: group || undefined,
                userId: person?.id,
                diagramId: diagram?.id,
                from: from ? startOfDay(from) : undefined,
                to: to ? endOfDay(to) : undefined,
                saves: showSaves ? 'show' : 'hide',
            }),
        JSON.stringify([group, person?.id, diagram?.id, from, to, showSaves])
    );

    const days = useMemo(() => groupByDay(list.items), [list.items]);
    const filtered =
        group !== '' || person !== null || diagram !== null || from || to;

    const clearFilters = () => {
        setGroup('');
        setPerson(null);
        setDiagram(null);
        setFrom('');
        setTo('');
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm">
            <div className="flex flex-wrap items-end gap-2">
                <div className="flex w-full flex-col gap-1 sm:w-52">
                    <span className="text-xs text-muted-foreground">What</span>
                    <OptionSelect
                        aria-label="Kind of activity"
                        value={group}
                        onValueChange={(v) => setGroup(v as '' | ActivityGroup)}
                        options={ACTIVITY_GROUP_OPTIONS}
                    />
                </div>

                <div className="flex w-full flex-col gap-1 sm:w-56">
                    <span className="text-xs text-muted-foreground">Who</span>
                    <div className="flex gap-1">
                        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    aria-label="Choose who did it"
                                    className="min-w-0 flex-1 justify-between font-normal"
                                >
                                    <span
                                        className={cn(
                                            'truncate',
                                            !person && 'text-muted-foreground'
                                        )}
                                    >
                                        {person?.label ?? 'Anyone'}
                                    </span>
                                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-72 p-2">
                                <UserPicker
                                    selected={null}
                                    excludeIds={NO_USERS}
                                    onSelect={(u) => {
                                        if (!u) return;
                                        setPerson({ id: u.id, label: u.email });
                                        setPickerOpen(false);
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                        {person ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Show everyone's activity"
                                onClick={() => setPerson(null)}
                            >
                                <X className="size-4" />
                            </Button>
                        ) : null}
                    </div>
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    From
                    <Input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-full sm:w-40"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    To
                    <Input
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={(e) => setTo(e.target.value)}
                        className="w-full sm:w-40"
                    />
                </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={showSaves}
                            onChange={(e) => setShowSaves(e.target.checked)}
                        />
                        Show every save
                    </label>
                    {diagram ? (
                        <span className="flex items-center gap-1 rounded-full border bg-accent py-0.5 pl-3 pr-1 text-sm text-accent-foreground">
                            <span className="max-w-64 truncate">
                                Diagram: {diagram.label}
                            </span>
                            <button
                                type="button"
                                aria-label="Show every diagram"
                                className="rounded-full p-0.5 hover:bg-background/60"
                                onClick={() => setDiagram(null)}
                            >
                                <X className="size-3.5" />
                            </button>
                        </span>
                    ) : null}
                    {filtered ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={clearFilters}
                        >
                            Clear filters
                        </Button>
                    ) : null}
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={list.loading}
                    onClick={list.reload}
                >
                    <RefreshCw
                        className={cn('size-4', list.loading && 'animate-spin')}
                    />
                    Refresh
                </Button>
            </div>

            {list.error ? (
                <p role="alert" className="px-1 text-sm text-destructive">
                    {list.error}
                </p>
            ) : null}

            <div
                className="max-h-[32rem] min-h-40 overflow-y-auto rounded-md border"
                aria-busy={list.loading}
            >
                {list.loading && list.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                        Loading…
                    </p>
                ) : list.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                        {filtered
                            ? 'Nothing matches these filters.'
                            : 'Nothing has happened yet.'}
                        {!showSaves && !list.error
                            ? ' Saves are hidden: tick "Show every save" to include them.'
                            : ''}
                    </p>
                ) : (
                    days.map((day) => (
                        <section key={day.key} aria-label={day.label}>
                            <h3 className="sticky top-0 z-10 border-b bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {day.label}
                            </h3>
                            <ul>
                                {day.items.map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex items-baseline justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                                    >
                                        <Sentence
                                            item={item}
                                            onPerson={setPerson}
                                            onDiagram={setDiagram}
                                            activeUserId={person?.id}
                                            activeDiagramId={diagram?.id}
                                        />
                                        <time
                                            dateTime={item.at}
                                            title={new Date(
                                                item.at
                                            ).toLocaleString()}
                                            className="shrink-0 text-xs tabular-nums text-muted-foreground"
                                        >
                                            {timeOf(item.at)}
                                        </time>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </div>

            <div className="flex h-9 items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
                <span aria-live="polite">
                    {list.items.length === 0
                        ? ''
                        : `${list.items.length} shown${list.hasMore ? '' : ', that is everything'}`}
                </span>
                {list.hasMore ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={list.loadingMore || list.loading}
                        onClick={list.loadMore}
                    >
                        {list.loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                ) : null}
            </div>
        </div>
    );
};
