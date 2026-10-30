import React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/button/button';
import type { IndexType, IndexTypeConfig } from '@/lib/domain/db-index';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { Label } from '@/components/label/label';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { cn } from '@/lib/utils';

export interface IndexTypeSelectorProps {
    options: Array<IndexTypeConfig & { disabled: boolean }>;
    value: IndexType;
    label: string;
    onChange: (value: IndexType) => void;
    readonly?: boolean;
    t: (key: string) => string;
}

export const IndexTypeSelector: React.FC<IndexTypeSelectorProps> = ({
    options,
    value,
    label,
    onChange,
    readonly,
    t,
}) => (
    <div className="mt-2 flex flex-col gap-2">
        <Label htmlFor="indexType" className="text-subtitle">
            {t('side_panel.tables_section.table.index_actions.index_type')}
        </Label>
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={readonly}
                >
                    {label}
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[180px] p-1">
                <div className="flex flex-col">
                    {options.map((option) => (
                        <IndexTypeOption
                            key={option.value}
                            option={option}
                            isSelected={value === option.value}
                            onSelect={() => {
                                if (!option.disabled) {
                                    onChange(option.value);
                                }
                            }}
                        />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    </div>
);

interface IndexTypeOptionProps {
    option: IndexTypeConfig & { disabled: boolean };
    isSelected: boolean;
    onSelect: () => void;
}

const IndexTypeOption: React.FC<IndexTypeOptionProps> = ({
    option,
    isSelected,
    onSelect,
}) => {
    const content = (
        <button
            type="button"
            aria-pressed={isSelected}
            // not `disabled`: a disabled button gets no pointer events, and the
            // tooltip saying why must still show
            aria-disabled={option.disabled}
            className={cn(
                'flex w-full cursor-pointer items-center rounded-xs px-2 py-1.5 text-left text-sm',
                option.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-accent',
                isSelected && 'bg-accent'
            )}
            onClick={onSelect}
        >
            <Check
                className={cn(
                    'mr-2 h-4 w-4',
                    isSelected ? 'opacity-100' : 'opacity-0'
                )}
            />
            {option.label}
        </button>
    );

    if (option.disabled && option.disabledTooltip) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">
                    {option.disabledTooltip}
                </TooltipContent>
            </Tooltip>
        );
    }

    return content;
};
