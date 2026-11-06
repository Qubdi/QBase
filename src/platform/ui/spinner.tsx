import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

const spinnerVariants = cva('animate-spin', {
    variants: {
        size: {
            small: 'size-4',
            medium: 'size-6',
            large: 'size-8',
        },
    },
    defaultVariants: { size: 'medium' },
});

export interface SpinnerProps
    extends
        Omit<React.SVGAttributes<SVGSVGElement>, 'children'>,
        VariantProps<typeof spinnerVariants> {}

function Spinner({ size, className, ...props }: SpinnerProps) {
    return (
        <Loader2
            role="status"
            aria-label="Loading"
            className={cn(spinnerVariants({ size }), className)}
            {...props}
        />
    );
}

export { Spinner, spinnerVariants };
