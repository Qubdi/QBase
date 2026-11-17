import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils/utils';

// Radix closes a popover when something outside it is pressed, but not when
// that something takes the press for itself: its dismissable layer also watches
// the mouse events that follow the press, and one that never reaches the
// document counts as "handled elsewhere". The canvas does exactly that: its pan
// and zoom stops `mousedown` on the empty background, so a popover opened from
// the side panel stayed open while the canvas was clicked or dragged.
//
// So the popover also closes on the press itself. It waits one tick first, so
// Radix has had its turn: a popover Radix has already closed is left alone, and
// the page is told once. A press inside the popover, on its trigger, or on
// anything that opened from inside it (the React tree, not the DOM tree, so a
// nested popover or menu counts) is not an outside press.
const PressInside = React.createContext<(() => void) | null>(null);

const Popover: React.FC<PopoverPrimitive.PopoverProps> = ({
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    ...props
}) => {
    const [inner, setInner] = React.useState(defaultOpen);
    const controlled = openProp !== undefined;
    const open = controlled ? openProp : inner;

    // what the page last showed: asking a closed popover to close is ignored
    const openRef = React.useRef(open);
    const change = React.useCallback(
        (next: boolean) => {
            if (!next && !openRef.current) return;
            if (!controlled) setInner(next);
            onOpenChange?.(next);
        },
        [controlled, onOpenChange]
    );
    const changeRef = React.useRef(change);
    React.useEffect(() => {
        openRef.current = open;
        changeRef.current = change;
    });

    const pressInside = React.useRef(false);
    const markInside = React.useCallback(() => {
        pressInside.current = true;
    }, []);
    React.useEffect(() => {
        if (!open) return;
        // every press starts as an outside one; the content and the trigger
        // (React's capture phase, which runs after this one) say otherwise
        const start = () => {
            pressInside.current = false;
        };
        const end = () => {
            if (pressInside.current) return;
            window.setTimeout(() => {
                if (openRef.current) changeRef.current(false);
            }, 0);
        };
        // not for the press that is opening the popover right now
        const timer = window.setTimeout(() => {
            document.addEventListener('pointerdown', start, true);
            document.addEventListener('pointerdown', end);
        }, 0);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('pointerdown', start, true);
            document.removeEventListener('pointerdown', end);
        };
    }, [open]);

    return (
        <PressInside.Provider value={markInside}>
            <PopoverPrimitive.Root
                {...props}
                open={open}
                onOpenChange={change}
            />
        </PressInside.Provider>
    );
};

const PopoverTrigger = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ onPointerDownCapture, ...props }, ref) => {
    const markInside = React.useContext(PressInside);
    return (
        <PopoverPrimitive.Trigger
            ref={ref}
            onPointerDownCapture={(event) => {
                onPointerDownCapture?.(event);
                markInside?.();
            }}
            {...props}
        />
    );
});
PopoverTrigger.displayName = PopoverPrimitive.Trigger.displayName;

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
    (
        {
            className,
            align = 'center',
            sideOffset = 4,
            onPointerDownCapture,
            ...props
        },
        ref
    ) => {
        const markInside = React.useContext(PressInside);
        return (
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    ref={ref}
                    align={align}
                    sideOffset={sideOffset}
                    className={cn(
                        'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]',
                        className
                    )}
                    onPointerDownCapture={(event) => {
                        onPointerDownCapture?.(event);
                        markInside?.();
                    }}
                    {...props}
                />
            </PopoverPrimitive.Portal>
        );
    }
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
