import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    api,
    errorMessage,
    type ActivityItem,
    type AdminStats,
} from '@/lib/qubdi/api';
import { compactNumber, plural, viewerTimeZone } from '@/lib/qubdi/overview';
import { cn } from '@/lib/utils';
import { ActivityChart } from './activity-chart';
import { ActivitySentence } from './activity-sentence';
import { adminPath } from './admin-sections';
import { StatTile } from './stat-tile';

/** How many of the latest events the Overview lists; the Activity page has the rest. */
export const RECENT_EVENTS = 8;

const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });

const dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
    });

/** Totals, a week of activity and the latest events: where an admin starts. */
export const OverviewPanel: React.FC = () => {
    const timeZone = useMemo(viewerTimeZone, []);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [recent, setRecent] = useState<ActivityItem[] | null>(null);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [recentError, setRecentError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let stale = false;
        setLoading(true);
        // the figures and the latest events are separate asks: one failing
        // must not hide the other
        void Promise.allSettled([
            api.adminStats(timeZone),
            api.adminListActivity({ limit: RECENT_EVENTS, saves: 'hide' }),
        ]).then(([figures, latest]) => {
            if (stale) return;
            if (figures.status === 'fulfilled') {
                setStats(figures.value);
                setStatsError(null);
            } else {
                setStatsError(errorMessage(figures.reason));
            }
            if (latest.status === 'fulfilled') {
                setRecent(latest.value.items);
                setRecentError(null);
            } else {
                setRecentError(errorMessage(latest.reason));
            }
            setUpdatedAt(new Date());
            setLoading(false);
        });
        return () => {
            stale = true;
        };
    }, [timeZone, tick]);

    const days = stats?.activity.days ?? [];
    // the chart's last day is today, in the zone the server counted in
    const today = days.at(-1)?.day ?? '';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                    {updatedAt
                        ? `Updated ${timeOf(updatedAt.toISOString())}`
                        : ''}
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loading}
                    onClick={() => setTick((t) => t + 1)}
                >
                    <RefreshCw
                        className={cn('size-4', loading && 'animate-spin')}
                    />
                    Refresh
                </Button>
            </div>

            {statsError ? (
                <p role="alert" className="text-sm text-destructive">
                    The figures could not be loaded: {statsError}
                </p>
            ) : null}

            {stats === null ? (
                statsError ? null : (
                    <div
                        aria-busy
                        aria-label="Loading the figures"
                        className="grid grid-cols-2 gap-3 md:grid-cols-3"
                    >
                        {Array.from({ length: 6 }, (_, i) => (
                            <div
                                key={i}
                                className="h-[6.5rem] animate-pulse rounded-xl border bg-muted"
                            />
                        ))}
                    </div>
                )
            ) : (
                // a refresh keeps what is on screen, dimmed, instead of flashing a skeleton
                <div
                    className={cn(
                        'flex flex-col gap-4 transition-opacity',
                        loading && 'opacity-60'
                    )}
                >
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <StatTile
                            label="Users"
                            value={stats.users.total}
                            details={[
                                `${compactNumber(stats.users.active)} active`,
                                plural(stats.users.admins, 'admin'),
                                `${compactNumber(stats.users.signedIn)} signed in now`,
                            ]}
                            to={adminPath('users')}
                        />
                        <StatTile
                            label="Projects"
                            value={stats.projects}
                            to={adminPath('projects')}
                        />
                        <StatTile
                            label="Diagrams"
                            value={stats.diagrams.total}
                            details={[
                                `${compactNumber(stats.diagrams.published)} published`,
                            ]}
                            to={adminPath('diagrams')}
                        />
                        <StatTile
                            label="Share links open"
                            value={stats.activeLinks}
                            to={adminPath('diagrams')}
                        />
                        <StatTile
                            label="Being edited now"
                            value={stats.editingNow}
                            to={adminPath('diagrams')}
                        />
                        <StatTile
                            label="Drift checks, last 24 hours"
                            value={stats.driftChecks24h}
                            to={adminPath('activity')}
                        />
                    </div>

                    <ActivityChart days={days} today={today} />
                </div>
            )}

            <section
                aria-labelledby="recent-activity-title"
                className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs"
            >
                <header className="flex items-center justify-between gap-2">
                    <h2
                        id="recent-activity-title"
                        className="font-primary text-base font-semibold"
                    >
                        Latest activity
                    </h2>
                    <Button asChild variant="ghost" size="sm">
                        <Link to={adminPath('activity')}>
                            See all activity
                            <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </header>

                {recentError ? (
                    <p role="alert" className="text-sm text-destructive">
                        The latest activity could not be loaded: {recentError}
                    </p>
                ) : recent === null ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing has happened yet.
                    </p>
                ) : (
                    <ul
                        className={cn(
                            'flex flex-col transition-opacity',
                            loading && 'opacity-60'
                        )}
                    >
                        {recent.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0"
                            >
                                <ActivitySentence item={item} />
                                <time
                                    dateTime={item.at}
                                    title={new Date(item.at).toLocaleString()}
                                    className="shrink-0 text-xs text-muted-foreground"
                                >
                                    {dayOf(item.at)}, {timeOf(item.at)}
                                </time>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};
