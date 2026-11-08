import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/platform/ui/tooltip';
import { cn } from '@/lib/utils';
import { databaseIcon } from './database-logos';
import {
    databaseTypeToLabelMap,
    type DatabaseType,
} from '@/qbase/diagram-types';

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
            src={databaseIcon(databaseType)}
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
