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
        <ellipse
            cx="12"
            cy="6"
            rx="8"
            ry="3"
            stroke="currentColor"
            strokeWidth="2"
        />
        <path
            d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"
            stroke="currentColor"
            strokeWidth="2"
        />
        <path
            d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
            stroke="currentColor"
            strokeWidth="2"
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
                Qubdi<span className="text-primary">DB</span>
            </span>
        ) : null}
    </span>
);
