import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/platform/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    databaseTypeToLabelMap,
    type DatabaseType,
} from '@/qbase/diagram-types';

/** The colour of each database's tile. */
const COLOURS: Record<string, string> = {
    postgresql: '#336791',
    mysql: '#00758f',
    sql_server: '#a91d22',
    mariadb: '#003545',
    sqlite: '#0f80cc',
    clickhouse: '#c28a00',
    cockroachdb: '#6933ff',
    oracle: '#c74634',
    generic: '#64748b',
};

/** The picture of a database as a data address: a database drum on its colour. */
function databaseIconSrc(type: string | null | undefined): string {
    const colour = COLOURS[type ?? ''] ?? COLOURS.generic;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<rect width="32" height="32" rx="7" fill="${colour}"/>` +
        `<g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round">` +
        `<ellipse cx="12" cy="5" rx="9" ry="3"/>` +
        `<path d="M3 5v14a9 3 0 0 0 18 0V5"/>` +
        `<path d="M3 12a9 3 0 0 0 18 0"/></g></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface DiagramIconProps {
    databaseType: DatabaseType | string | null | undefined;
    /** makes the icon a button that also answers Enter and Space */
    onClick?: () => void;
    className?: string;
    alt?: string;
}

/** The icon of a diagram's database; a button only when it has something to do. */
export const DiagramIcon: React.FC<DiagramIconProps> = ({
    databaseType,
    onClick,
    className,
    alt = 'database',
}) => {
    const label =
        databaseTypeToLabelMap[databaseType as DatabaseType] ?? undefined;
    const image = (
        <img
            src={databaseIconSrc(databaseType)}
            alt={alt}
            title={label}
            className={cn('size-5 shrink-0 rounded', className)}
            draggable={false}
        />
    );
    if (!onClick) return image;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex cursor-pointer"
                    onClick={onClick}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClick();
                        }
                    }}
                >
                    {image}
                </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
};
