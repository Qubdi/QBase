import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/platform/ui/tooltip';
import { cn } from '@/lib/utils';
import {
    databaseTypeToLabelMap,
    type DatabaseType,
} from '@/qbase/diagram-types';

/** A colour and a short mark for each database, drawn as a small picture. */
const LOOKS: Record<string, { colour: string; mark: string }> = {
    postgresql: { colour: '#336791', mark: 'Pg' },
    mysql: { colour: '#00758f', mark: 'My' },
    sql_server: { colour: '#a91d22', mark: 'Ms' },
    mariadb: { colour: '#003545', mark: 'Mr' },
    sqlite: { colour: '#0f80cc', mark: 'Sq' },
    clickhouse: { colour: '#c28a00', mark: 'Ch' },
    cockroachdb: { colour: '#6933ff', mark: 'Cr' },
    oracle: { colour: '#c74634', mark: 'Or' },
    generic: { colour: '#64748b', mark: 'Db' },
};

/** The picture of a database as a data address; unknown databases get the generic one. */
function databaseIconSrc(type: string | null | undefined): string {
    const { colour, mark } = LOOKS[type ?? ''] ?? LOOKS.generic;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<rect width="32" height="32" rx="7" fill="${colour}"/>` +
        `<text x="16" y="21" font-family="sans-serif" font-size="14" font-weight="700" ` +
        `text-anchor="middle" fill="#fff">${mark}</text></svg>`;
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
