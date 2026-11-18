import React, { useEffect, useState } from 'react';
import { ago, exactTime } from '@/lib/qubdi/when';
import { msUntilAgeChanges } from '@/lib/qubdi/next-tick';

export interface AgoProps {
    /** the ISO time to describe, such as a user's last_login_at */
    iso: string;
    className?: string;
}

/**
 * "just now", "12 seconds ago", "3 minutes ago", "2 hours ago": written from the
 * time itself in the browser, and rewritten as it ages: every second while it
 * reads in seconds, every minute in minutes, hourly in hours, then daily. The
 * exact time is the tooltip. A hidden tab stops the clock and catches up when it
 * is shown again.
 */
export const Ago: React.FC<AgoProps> = ({ iso, className }) => {
    // the clock the age is written against; a different time starts it again
    const [clock, setClock] = useState(() => ({ iso, now: new Date() }));
    if (clock.iso !== iso) setClock({ iso, now: new Date() });
    const now = clock.now;

    useEffect(() => {
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => {
            clearTimeout(timer);
            if (document.hidden) return;
            timer = setTimeout(
                () => {
                    setClock({ iso, now: new Date() });
                    schedule();
                },
                msUntilAgeChanges(Date.now() - then)
            );
        };
        const onVisible = () => {
            if (!document.hidden) {
                setClock({ iso, now: new Date() });
                schedule();
            }
        };
        schedule();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [iso]);

    return (
        <time dateTime={iso} title={exactTime(iso)} className={className}>
            {ago(iso, now)}
        </time>
    );
};
