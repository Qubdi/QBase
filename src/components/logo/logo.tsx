import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
    className?: string;
}

// The name is the logo: no icon, just the wordmark.
export const Logo: React.FC<LogoProps> = ({ className }) => (
    <span
        className={cn(
            'inline-flex h-full cursor-default select-none items-center font-primary text-lg font-bold leading-none tracking-tight',
            className
        )}
        data-testid="brand"
    >
        <span>
            <span className="text-primary">Q</span>Base
        </span>
    </span>
);
