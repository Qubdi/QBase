import React from 'react';
import { MessageSquareText } from 'lucide-react';
import { useText } from '@/platform/panel/use-text';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';

/**
 * The comment icon inside the name box of a field that has a description (side
 * panel). A click shows the description and nothing else; the rest of the
 * field's settings, and changing the description, are in Field Attributes, behind
 * the "..." button. The icon sits over the right end of the name box (see
 * design/field-description).
 */
export const DescriptionPopover: React.FC<{ description: string }> = ({
    description,
}) => {
    const text = useText();
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={text('fields.showComment')}
                    title={description}
                    className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <MessageSquareText className="size-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-64 space-y-2 rounded-[10px]"
                aria-label={text('fields.description')}
            >
                <h4 className="border-b pb-2 text-sm font-semibold">
                    {text('fields.description')}
                </h4>
                {/* what was typed is kept: line breaks stay, a long word wraps */}
                <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                    {description}
                </p>
            </PopoverContent>
        </Popover>
    );
};
