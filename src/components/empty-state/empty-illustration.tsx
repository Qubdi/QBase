import React from 'react';
import { cn } from '@/lib/utils';

export const EmptyIllustration: React.FC<{ className?: string }> = ({
    className,
}) => (
    <svg
        viewBox="0 0 120 96"
        fill="none"
        role="img"
        aria-label="Empty state"
        className={cn('h-full w-full', className)}
    >
        <rect
            x="8"
            y="14"
            width="64"
            height="44"
            rx="8"
            className="fill-card stroke-border"
            strokeWidth="2"
            strokeDasharray="4 4"
        />
        <rect
            x="40"
            y="32"
            width="72"
            height="52"
            rx="9"
            className="fill-card stroke-primary"
            strokeWidth="2"
        />
        <path
            d="M40 48h72"
            className="stroke-primary"
            strokeWidth="2"
            opacity="0.5"
        />
        <rect
            x="40"
            y="32"
            width="72"
            height="16"
            rx="9"
            className="fill-primary"
            opacity="0.14"
        />
        <circle cx="50" cy="40" r="2.5" className="fill-primary" />
        <rect
            x="58"
            y="38"
            width="28"
            height="4"
            rx="2"
            className="fill-primary"
            opacity="0.6"
        />
        <rect
            x="50"
            y="57"
            width="22"
            height="4"
            rx="2"
            className="fill-muted-foreground"
            opacity="0.45"
        />
        <rect
            x="78"
            y="57"
            width="24"
            height="4"
            rx="2"
            className="fill-muted-foreground"
            opacity="0.25"
        />
        <rect
            x="50"
            y="68"
            width="30"
            height="4"
            rx="2"
            className="fill-muted-foreground"
            opacity="0.45"
        />
        <rect
            x="86"
            y="68"
            width="16"
            height="4"
            rx="2"
            className="fill-muted-foreground"
            opacity="0.25"
        />
        <path
            d="M72 36H80"
            className="stroke-border"
            strokeWidth="2"
            strokeLinecap="round"
        />
    </svg>
);
