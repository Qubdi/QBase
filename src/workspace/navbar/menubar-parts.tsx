import * as React from 'react';
import * as Primitive from '@radix-ui/react-menubar';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

/** Styled pieces of Radix's menubar, in the same look as the dropdown menu. */

const item =
    'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0';
const panel =
    'z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';

export const Menubar = React.forwardRef<
    React.ComponentRef<typeof Primitive.Root>,
    React.ComponentPropsWithoutRef<typeof Primitive.Root>
>(({ className, ...props }, ref) => (
    <Primitive.Root
        ref={ref}
        className={cn(
            'flex h-9 items-center gap-1.5 rounded-md p-1',
            className
        )}
        {...props}
    />
));
Menubar.displayName = 'Menubar';

export const MenubarMenu = Primitive.Menu;
export const MenubarSub = Primitive.Sub;
export const MenubarRadioGroup = Primitive.RadioGroup;

export const MenubarTrigger = React.forwardRef<
    React.ComponentRef<typeof Primitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof Primitive.Trigger>
>(({ className, ...props }, ref) => (
    <Primitive.Trigger
        ref={ref}
        className={cn(
            'flex cursor-default select-none items-center rounded-md px-3 py-1 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
            className
        )}
        {...props}
    />
));
MenubarTrigger.displayName = 'MenubarTrigger';

export const MenubarContent = React.forwardRef<
    React.ComponentRef<typeof Primitive.Content>,
    React.ComponentPropsWithoutRef<typeof Primitive.Content>
>(({ className, align = 'start', sideOffset = 9, ...props }, ref) => (
    <Primitive.Portal>
        <Primitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn(panel, className)}
            {...props}
        />
    </Primitive.Portal>
));
MenubarContent.displayName = 'MenubarContent';

export const MenubarSubTrigger = React.forwardRef<
    React.ComponentRef<typeof Primitive.SubTrigger>,
    React.ComponentPropsWithoutRef<typeof Primitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
    <Primitive.SubTrigger
        ref={ref}
        className={cn(item, 'data-[state=open]:bg-accent', className)}
        {...props}
    >
        {children}
        <ChevronRight className="ml-auto" />
    </Primitive.SubTrigger>
));
MenubarSubTrigger.displayName = 'MenubarSubTrigger';

export const MenubarSubContent = React.forwardRef<
    React.ComponentRef<typeof Primitive.SubContent>,
    React.ComponentPropsWithoutRef<typeof Primitive.SubContent>
>(({ className, ...props }, ref) => (
    <Primitive.Portal>
        <Primitive.SubContent
            ref={ref}
            className={cn(panel, className)}
            {...props}
        />
    </Primitive.Portal>
));
MenubarSubContent.displayName = 'MenubarSubContent';

export const MenubarItem = React.forwardRef<
    React.ComponentRef<typeof Primitive.Item>,
    React.ComponentPropsWithoutRef<typeof Primitive.Item>
>(({ className, ...props }, ref) => (
    <Primitive.Item ref={ref} className={cn(item, className)} {...props} />
));
MenubarItem.displayName = 'MenubarItem';

export const MenubarRadioItem = React.forwardRef<
    React.ComponentRef<typeof Primitive.RadioItem>,
    React.ComponentPropsWithoutRef<typeof Primitive.RadioItem>
>(({ className, children, ...props }, ref) => (
    <Primitive.RadioItem
        ref={ref}
        className={cn(item, 'pl-8', className)}
        {...props}
    >
        <span className="absolute left-2 flex size-4 items-center justify-center">
            <Primitive.ItemIndicator>
                <Check className="size-4" />
            </Primitive.ItemIndicator>
        </span>
        {children}
    </Primitive.RadioItem>
));
MenubarRadioItem.displayName = 'MenubarRadioItem';

export const MenubarSeparator = React.forwardRef<
    React.ComponentRef<typeof Primitive.Separator>,
    React.ComponentPropsWithoutRef<typeof Primitive.Separator>
>(({ className, ...props }, ref) => (
    <Primitive.Separator
        ref={ref}
        className={cn('-mx-1 my-1 h-px bg-secondary', className)}
        {...props}
    />
));
MenubarSeparator.displayName = 'MenubarSeparator';

export const MenubarShortcut = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
    <span
        className={cn(
            'ml-auto pl-6 text-xs tracking-[1.2px] text-muted-foreground',
            className
        )}
        {...props}
    />
);
