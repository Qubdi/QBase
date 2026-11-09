import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, Download, RefreshCw, X } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { OptionSelect } from '@/components/option-select/option-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { UserPicker } from '@/components/qubdi/user-picker';
import { useCursorList } from '@/hooks/use-cursor-list';
import {
    activityGroupOptions,
    endOfDay,
    groupByDay,
    startOfDay,
} from '@/lib/qubdi/activity';
import {
    api,
    errorMessage,
    type ActivityGroup,
    type ActivityItem,
} from '@/lib/qubdi/api';
import { localDateStamp, saveBlob } from '@/lib/qubdi/save-blob';
import { useToast } from '@/platform/toast/use-toast';
import { cn } from '@/lib/utils';
import { ActivitySentence, type Named } from './activity-sentence';
import { timeOf } from './time-of';
import { uiLocale } from '@/lib/qubdi/locale';

const PAGE_SIZE = 30;
const NO_USERS: ReadonlySet<string> = new Set();

/** Who did what and when, newest first, with filters and "Load more". */
export const ActivityPanel: React.FC = () => {
    const { t } = useTranslation();
    const [group, setGroup] = useState<'' | ActivityGroup>('');
    const [person, setPerson] = useState<Named | null>(null);
    const [diagram, setDiagram] = useState<Named | null>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [showSaves, setShowSaves] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const { toast } = useToast();

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

    /** The file holds what the list would show with these filters, not only what is loaded. */
    const exportCsv = async () => {
        setExporting(true);
        setExportError(null);
        try {
            const { blob, rows, truncated } = await api.adminExportActivity({
                group: group || undefined,
                userId: person?.id,
                diagramId: diagram?.id,
                from: from ? startOfDay(from) : undefined,
                to: to ? endOfDay(to) : undefined,
                saves: showSaves ? 'show' : 'hide',
            });
            saveBlob(blob, `qbase-activity-${localDateStamp()}.csv`);
            toast({
                title: t('qubdi.adminProjects.activity.exportedTitle'),
                description: truncated
                    ? t('qubdi.adminProjects.activity.exportedTruncated', {
                          rows,
                      })
                    : t('qubdi.adminProjects.activity.exportedRows', {
                          count: rows,
                      }),
            });
        } catch (e) {
            setExportError(errorMessage(e));
        } finally {
            setExporting(false);
        }
    };

    const clearFilters = () => {
        setGroup('');
        setPerson(null);
        setDiagram(null);
        setFrom('');
        setTo('');
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-xs">
            <div className="flex flex-wrap items-end gap-2">
                <div className="flex w-full flex-col gap-1 sm:w-52">
                    <span className="text-xs text-muted-foreground">
                        {t('qubdi.adminProjects.activity.what')}
                    </span>
                    <OptionSelect
                        aria-label={t('qubdi.adminProjects.activity.kindLabel')}
                        value={group}
                        onValueChange={(v) => setGroup(v as '' | ActivityGroup)}
                        options={activityGroupOptions()}
                    />
                </div>

                <div className="flex w-full flex-col gap-1 sm:w-56">
                    <span className="text-xs text-muted-foreground">
                        {t('qubdi.adminProjects.activity.who')}
                    </span>
                    <div className="flex gap-1">
                        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    aria-label={t(
                                        'qubdi.adminProjects.activity.chooseWho'
                                    )}
                                    className="min-w-0 flex-1 justify-between font-normal"
                                >
                                    <span
                                        className={cn(
                                            'truncate',
                                            !person && 'text-muted-foreground'
                                        )}
                                    >
                                        {person?.label ??
                                            t(
                                                'qubdi.adminProjects.activity.anyone'
                                            )}
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
                                aria-label={t(
                                    'qubdi.adminProjects.activity.everyone'
                                )}
                                onClick={() => setPerson(null)}
                            >
                                <X className="size-4" />
                            </Button>
                        ) : null}
                    </div>
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t('qubdi.adminProjects.activity.from')}
                    <Input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-full sm:w-40"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t('qubdi.adminProjects.activity.to')}
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
                        {t('qubdi.adminProjects.activity.showSaves')}
                    </label>
                    {diagram ? (
                        <span className="flex items-center gap-1 rounded-full border bg-accent py-0.5 pl-3 pr-1 text-sm text-accent-foreground">
                            <span className="max-w-64 truncate">
                                {t('qubdi.adminProjects.activity.diagramChip', {
                                    label: diagram.label,
                                })}
                            </span>
                            <button
                                type="button"
                                aria-label={t(
                                    'qubdi.adminProjects.activity.showEveryDiagram'
                                )}
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
                            {t('qubdi.adminProjects.activity.clearFilters')}
                        </Button>
                    ) : null}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={exporting}
                        onClick={() => void exportCsv()}
                    >
                        <Download className="size-4" />
                        {exporting
                            ? t('qubdi.adminProjects.activity.exporting')
                            : t('qubdi.adminProjects.activity.exportCsv')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={list.loading}
                        onClick={list.reload}
                    >
                        <RefreshCw
                            className={cn(
                                'size-4',
                                list.loading && 'animate-spin'
                            )}
                        />
                        {t('qubdi.adminProjects.activity.refresh')}
                    </Button>
                </div>
            </div>

            {exportError ? (
                <p role="alert" className="px-1 text-sm text-destructive">
                    {exportError}
                </p>
            ) : null}

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
                        {t('qubdi.adminProjects.activity.loading')}
                    </p>
                ) : list.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                        {filtered
                            ? t('qubdi.adminProjects.activity.noMatch')
                            : t('qubdi.adminProjects.activity.empty')}
                        {!showSaves && !list.error
                            ? t('qubdi.adminProjects.activity.savesHidden')
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
                                        <ActivitySentence
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
                                            ).toLocaleString(uiLocale())}
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
                        : list.hasMore
                          ? t('qubdi.adminProjects.activity.shown', {
                                count: list.items.length,
                            })
                          : t('qubdi.adminProjects.activity.shownAll', {
                                count: list.items.length,
                            })}
                </span>
                {list.hasMore ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={list.loadingMore || list.loading}
                        onClick={list.loadMore}
                    >
                        {list.loadingMore
                            ? t('qubdi.adminProjects.activity.loading')
                            : t('qubdi.adminProjects.activity.loadMore')}
                    </Button>
                ) : null}
            </div>
        </div>
    );
};
