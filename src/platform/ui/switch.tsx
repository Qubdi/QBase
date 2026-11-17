import * as React from 'react';

import { cn } from '@/lib/utils/utils';

export interface SwitchProps extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'role' | 'type' | 'children'
> {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

/**
 * A small on/off switch for a yes-or-no setting. It is a button with the switch
 * role, so a label around it names it and a click on the label flips it, and
 * Space and Enter work from the keyboard.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ className, checked, onCheckedChange, onClick, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            role="switch"
            aria-checked={checked}
            data-state={checked ? 'checked' : 'unchecked'}
            className={cn(
                'group peer relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full bg-muted-foreground/35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ring-offset-popover disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary motion-reduce:transition-none',
                className
            )}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) onCheckedChange?.(!checked);
            }}
            {...props}
        >
            {/* The knob is placed by a transform from the track's corner, not centred by
                flex. On a screen scaled to 125 % the track is 20 device pixels tall and
                the knob 15, and layout rounds the 5 spare pixels to 2 above and 3 below.
                A transform is painted at the half pixel, 2.5 above and 2.5 below. No
                shadow either: it darkened only the lower gap. */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 block size-3 translate-x-0.5 translate-y-0.5 rounded-full bg-popover transition-transform group-data-[state=checked]:translate-x-3.5 group-data-[state=checked]:bg-primary-foreground motion-reduce:transition-none"
            />
        </button>
    )
);
Switch.displayName = 'Switch';

export { Switch };
