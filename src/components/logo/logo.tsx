import React from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
    className?: string;
}

// The name is the logo, as on the main branch: no icon, only the wordmark with a coloured Q.
export const Logo: React.FC<LogoProps> = ({ className }) => (
    <span
        className={cn(
            'inline-flex h-full cursor-default select-none items-center font-primary text-lg font-bold leading-[18px] tracking-[-0.45px]',
            className
        )}
        data-testid="brand"
    >
        <span>
            <span className="text-primary">Q</span>Base
        </span>
    </span>
);
