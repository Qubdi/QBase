import React from 'react';
import { Link } from 'react-router-dom';
import { compactNumber } from '@/lib/qubdi/overview';
import { cn } from '@/lib/utils';

export interface StatTileProps {
    /** sentence case, no trailing colon */
    label: string;
    value: number;
    /** short lines under the value, such as "2 admins" */
    details?: string[];
    /** where the figure comes from: the tile becomes a link to it */
    to?: string;
}

/**
 * One number and what it counts. The value uses proportional figures, as a
 * large standalone number should; only columns that must line up use tabular ones.
 */
export const StatTile: React.FC<StatTileProps> = ({
    label,
    value,
    details = [],
    to,
}) => {
    const body = (
        <>
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-3xl font-semibold leading-none">
                {compactNumber(value)}
            </span>
            {details.length > 0 ? (
                <span className="mt-1 flex flex-col text-xs text-muted-foreground">
                    {details.map((d) => (
                        <span key={d}>{d}</span>
                    ))}
                </span>
            ) : null}
        </>
    );
    const shape =
        'flex min-h-[6.5rem] flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm';

    return to ? (
        <Link
            to={to}
            className={cn(
                shape,
                'transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
        >
            {body}
        </Link>
    ) : (
        <div className={shape}>{body}</div>
    );
};
