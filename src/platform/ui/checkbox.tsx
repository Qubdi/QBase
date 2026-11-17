import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils/utils';

// The "Roomier" look chosen in design/checkbox: an 18 px box with a 6 px corner
// and a 1.5 px border, and a bold tick (stroke 3) drawn smaller than the box, so
// it has space around it. `rounded-[6px]` is written out on purpose: the theme's
// `rounded-md` follows the 0.75 rem radius and is too round for a box this size.
const Checkbox = React.forwardRef<
    React.ElementRef<typeof CheckboxPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
            'grid place-content-center peer size-[18px] shrink-0 rounded-[6px] border-[1.5px] border-muted-foreground/55 bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:enabled:hover:border-muted-foreground/85 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
            className
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator
            className={cn('grid place-content-center text-current')}
        >
            <Check className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
