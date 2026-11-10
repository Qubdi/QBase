import * as React from 'react';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils/utils';

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const itemBase =
    'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0';

const panelBase =
    'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

const DropdownMenuContent = React.forwardRef<
    React.ComponentRef<typeof MenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <MenuPrimitive.Portal>
        <MenuPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(panelBase, 'shadow-md', className)}
            {...props}
        />
    </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = MenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
    React.ComponentRef<typeof MenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <MenuPrimitive.Item
        ref={ref}
        className={cn(itemBase, inset && 'pl-8', className)}
        {...props}
    />
));
DropdownMenuItem.displayName = MenuPrimitive.Item.displayName;

const DropdownMenuLabel = React.forwardRef<
    React.ComponentRef<typeof MenuPrimitive.Label>,
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label> & {
        inset?: boolean;
    }
>(({ className, inset, ...props }, ref) => (
    <MenuPrimitive.Label
        ref={ref}
        className={cn(
            'px-2 py-1.5 text-sm font-semibold',
            inset && 'pl-8',
            className
        )}
        {...props}
    />
));
DropdownMenuLabel.displayName = MenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
    React.ComponentRef<typeof MenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <MenuPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 my-1 h-px bg-muted', className)}
        {...props}
    />
));
DropdownMenuSeparator.displayName = MenuPrimitive.Separator.displayName;

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
};
