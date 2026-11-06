import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import {
    busiestDay,
    compactNumber,
    dayLabel,
    heightPercent,
    scaleFor,
    type ActivityDay,
} from '@/lib/qubdi/overview';
import { cn } from '@/lib/utils';

export interface ActivityChartProps {
    /** oldest first, today last */
    days: ActivityDay[];
    /** `YYYY-MM-DD` of today in the zone the days were counted in */
    today: string;
}

/** The plot's height: the columns, and the grid and tick labels behind them. */
const PLOT = 'h-44';

/**
 * Events per day as thin columns: one series in the accent colour, so no legend
 * (the title says what is plotted), a hairline grid, the busiest day labelled on
 * its column, and every other value in a tooltip that opens on hover and on
 * keyboard focus. The table view says the same in words.
 */
export const ActivityChart: React.FC<ActivityChartProps> = ({
    days,
    today,
}) => {
    const { t } = useTranslation();
    const [view, setView] = useState<'chart' | 'table'>('chart');
    const [active, setActive] = useState<number | null>(null);
    const scale = useMemo(() => scaleFor(days.map((d) => d.events)), [days]);
    const labels = useMemo(
        () => days.map((d) => dayLabel(d.day, today)),
        [days, today]
    );
    const busiest = busiestDay(days);
    const total = days.reduce((sum, d) => sum + d.events, 0);
    const last = days.length - 1;
    const events = (n: number) =>
        t('qubdi.adminProjects.chart.events', {
            count: n,
            formatted: compactNumber(n),
        });

    return (
        <section
            aria-labelledby="activity-chart-title"
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
        >
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2
                        id="activity-chart-title"
                        className="font-primary text-base font-semibold"
                    >
                        {t('qubdi.adminProjects.chart.title')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t('qubdi.adminProjects.chart.subtitle')}
                    </p>
                </div>
                <div
                    role="group"
                    aria-label={t('qubdi.adminProjects.chart.view')}
                    className="flex gap-1"
                >
                    {(['chart', 'table'] as const).map((v) => (
                        <Button
                            key={v}
                            type="button"
                            size="sm"
                            variant={view === v ? 'secondary' : 'ghost'}
                            aria-pressed={view === v}
                            onClick={() => setView(v)}
                        >
                            {v === 'chart'
                                ? t('qubdi.adminProjects.chart.chart')
                                : t('qubdi.adminProjects.chart.table')}
                        </Button>
                    ))}
                </div>
            </header>

            {view === 'chart' ? (
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 pt-2">
                    <div className={cn('relative', PLOT)} aria-hidden>
                        {scale.ticks.map((tick) => (
                            <span
                                key={tick}
                                className="absolute right-0 translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                                style={{
                                    bottom: `${heightPercent(tick, scale)}%`,
                                }}
                            >
                                {compactNumber(tick)}
                            </span>
                        ))}
                    </div>
                    <div className={cn('relative', PLOT)}>
                        {scale.ticks.map((tick) => (
                            <div
                                key={tick}
                                aria-hidden
                                className="absolute inset-x-0 border-t border-border"
                                style={{
                                    bottom: `${heightPercent(tick, scale)}%`,
                                }}
                            />
                        ))}
                        <ul className="absolute inset-0 grid grid-cols-7">
                            {days.map((d, i) => {
                                const pct = heightPercent(d.events, scale);
                                const isBusiest = busiest?.day === d.day;
                                return (
                                    <li key={d.day} className="relative">
                                        {/* the whole day's band is the target, not just the painted column */}
                                        <button
                                            type="button"
                                            aria-label={t(
                                                'qubdi.adminProjects.chart.dayEvents',
                                                {
                                                    day: labels[i].full,
                                                    events: events(d.events),
                                                }
                                            )}
                                            className="group relative flex size-full items-end justify-center rounded-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                                            onMouseEnter={() => setActive(i)}
                                            onMouseLeave={() => setActive(null)}
                                            onFocus={() => setActive(i)}
                                            onBlur={() => setActive(null)}
                                        >
                                            <span
                                                aria-hidden
                                                className="w-full max-w-6 rounded-t-[4px] bg-primary transition-[filter] group-hover:brightness-110"
                                                style={{
                                                    height: `${pct}%`,
                                                    minHeight:
                                                        d.events > 0 ? 2 : 0,
                                                }}
                                            />
                                            {isBusiest && active !== i ? (
                                                <span
                                                    aria-hidden
                                                    className="absolute text-xs font-medium"
                                                    style={{
                                                        bottom: `calc(${pct}% + 4px)`,
                                                    }}
                                                >
                                                    {compactNumber(d.events)}
                                                </span>
                                            ) : null}
                                        </button>
                                        {active === i ? (
                                            <div
                                                role="tooltip"
                                                className={cn(
                                                    'pointer-events-none absolute z-20 w-max rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md',
                                                    i === 0
                                                        ? 'left-0'
                                                        : i === last
                                                          ? 'right-0'
                                                          : 'left-1/2 -translate-x-1/2'
                                                )}
                                                style={{
                                                    bottom: `calc(${pct}% + 10px)`,
                                                }}
                                            >
                                                <div className="text-sm font-semibold text-popover-foreground">
                                                    {events(d.events)}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    {labels[i].full}
                                                </div>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    <div aria-hidden />
                    <ol
                        aria-hidden
                        className="mt-2 grid grid-cols-7 text-center text-xs text-muted-foreground"
                    >
                        {labels.map((l, i) => (
                            <li
                                key={days[i].day}
                                className={cn(
                                    'flex flex-col',
                                    l.isToday && 'font-semibold text-foreground'
                                )}
                            >
                                <span>
                                    {l.isToday
                                        ? t('qubdi.adminProjects.chart.today')
                                        : l.weekday}
                                </span>
                                <span>{l.date}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : (
                <table className="w-full text-sm">
                    <caption className="sr-only">
                        {t('qubdi.adminProjects.chart.caption')}
                    </caption>
                    <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="py-1.5 pr-2 font-medium">
                                {t('qubdi.adminProjects.chart.colDay')}
                            </th>
                            <th className="py-1.5 text-right font-medium">
                                {t('qubdi.adminProjects.chart.colEvents')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {days.map((d, i) => (
                            <tr
                                key={d.day}
                                className="border-b last:border-b-0"
                            >
                                <td className="py-1.5 pr-2">
                                    {labels[i].full}
                                    {labels[i].isToday ? (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            {t(
                                                'qubdi.adminProjects.chart.todayTag'
                                            )}
                                        </span>
                                    ) : null}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                    {d.events.toLocaleString('en-US')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <p className="text-sm text-muted-foreground">
                {total === 0
                    ? t('qubdi.adminProjects.chart.summaryNone')
                    : busiest
                      ? t('qubdi.adminProjects.chart.summaryBusiest', {
                            events: events(total),
                            day: labels[days.indexOf(busiest)].full,
                            busiest: compactNumber(busiest.events),
                        })
                      : t('qubdi.adminProjects.chart.summary', {
                            events: events(total),
                        })}
            </p>
        </section>
    );
};
