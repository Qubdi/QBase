import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
    className?: string;
    showWordmark?: boolean;
}

export const LogoMark: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={cn('size-6 shrink-0 text-primary', className)}
    >
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
        <path
            d="M16.5 16.5L21.5 21.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
        <ellipse
            cx="11"
            cy="8.5"
            rx="4"
            ry="1.6"
            stroke="currentColor"
            strokeWidth="1.6"
        />
        <path
            d="M7 8.5v4.5c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6V8.5"
            stroke="currentColor"
            strokeWidth="1.6"
        />
    </svg>
);

export const Logo: React.FC<LogoProps> = ({
    className,
    showWordmark = true,
}) => (
    <span
        className={cn(
            'inline-flex h-full cursor-default select-none items-center gap-2 font-primary text-lg font-bold leading-none tracking-tight',
            className
        )}
        data-testid="brand"
    >
        <LogoMark />
        {showWordmark ? (
            <span>
                <span className="text-primary">Q</span>Base
            </span>
        ) : null}
    </span>
);
