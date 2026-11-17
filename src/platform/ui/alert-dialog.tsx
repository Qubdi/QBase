import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

import { useReturnFocus } from './use-return-focus';
import { cn } from '@/lib/utils/utils';
import { buttonVariants } from './button';

// Radix keeps an alert dialog open on an outside click. Here every popup closes
// the same way: Escape, the Cancel button, or a click on the dark area around
// it. The overlay asks the root to close through this context, so the dialog's
// own onOpenChange (and any guard in it) still decides.
const CloseRequest = React.createContext<(() => void) | null>(null);

const AlertDialog: React.FC<AlertDialogPrimitive.AlertDialogProps> = ({
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    ...props
}) => {
    const [inner, setInner] = React.useState(defaultOpen);
    const controlled = openProp !== undefined;
    const open = controlled ? openProp : inner;
    const change = React.useCallback(
        (next: boolean) => {
            if (!controlled) setInner(next);
            onOpenChange?.(next);
        },
        [controlled, onOpenChange]
    );
    const requestClose = React.useCallback(() => change(false), [change]);
    return (
        <CloseRequest.Provider value={requestClose}>
            <AlertDialogPrimitive.Root
                {...props}
                open={open}
                onOpenChange={change}
            />
        </CloseRequest.Provider>
    );
};

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, onClick, ...props }, ref) => {
    const requestClose = React.useContext(CloseRequest);
    return (
        <AlertDialogPrimitive.Overlay
            className={cn(
                'fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                className
            )}
            {...props}
            onClick={(e) => {
                onClick?.(e);
                if (!e.defaultPrevented && e.target === e.currentTarget) {
                    requestClose?.();
                }
            }}
            ref={ref}
        />
    );
});
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const returnFocus = useReturnFocus({
        onOpenAutoFocus,
        onCloseAutoFocus,
    });
    return (
        <AlertDialogPortal>
            <AlertDialogOverlay />
            <AlertDialogPrimitive.Content
                ref={ref}
                className={cn(
                    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
                    className
                )}
                {...props}
                {...returnFocus}
            />
        </AlertDialogPortal>
    );
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            'flex flex-col space-y-2 text-center sm:text-left',
            className
        )}
        {...props}
    />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
            className
        )}
        {...props}
    />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Title
        ref={ref}
        className={cn(
            'text-lg font-semibold leading-7 tracking-tight',
            className
        )}
        {...props}
    />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Description
        ref={ref}
        className={cn('text-sm text-muted-foreground', className)}
        {...props}
    />
));
AlertDialogDescription.displayName =
    AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Action>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Action
        ref={ref}
        className={cn(buttonVariants(), className)}
        {...props}
    />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Cancel
        ref={ref}
        className={cn(
            buttonVariants({ variant: 'outline' }),
            'mt-2 sm:mt-0',
            className
        )}
        {...props}
    />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
    AlertDialog,
    AlertDialogOverlay,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
};
