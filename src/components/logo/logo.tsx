import React from 'react';
import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LogoProps {
    className?: string;
    /** draw the small database glyph before the wordmark */
    glyph?: boolean;
}

/** The product mark: a line glyph in the brand colour, then "QBase" with a coloured Q. */
export const Logo: React.FC<LogoProps> = ({ className, glyph = true }) => (
    <span
        className={cn(
            'inline-flex h-full cursor-default select-none items-center gap-2 font-primary text-lg font-bold leading-[18px] tracking-[-0.45px]',
            className
        )}
        data-testid="brand"
    >
        {glyph ? (
            <Database aria-hidden className="size-6 text-primary" />
        ) : null}
        <span>
            <span className="text-primary">Q</span>Base
        </span>
    </span>
);
