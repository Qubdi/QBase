import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/platform/ui/select';
import { cn } from '@/lib/utils/utils';
import {
    fromInternalValue,
    toInternalValue,
    type SelectOption,
} from './option-select-values';

export interface OptionSelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    size?: 'default' | 'sm';
    id?: string;
    className?: string;
    'aria-label'?: string;
}

/** A single-choice dropdown over a plain list of options. */
export const OptionSelect: React.FC<OptionSelectProps> = ({
    value,
    onValueChange,
    options,
    placeholder,
    disabled,
    size = 'default',
    id,
    className,
    'aria-label': ariaLabel,
}) => {
    const internal = toInternalValue(value, options);
    return (
        <Select
            value={internal}
            onValueChange={(v) => onValueChange(fromInternalValue(v))}
            disabled={disabled}
        >
            <SelectTrigger
                id={id}
                aria-label={ariaLabel}
                className={cn(size === 'sm' && 'h-8 text-xs', className)}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem
                        key={o.value}
                        value={toInternalValue(o.value, options)}
                        disabled={o.disabled}
                    >
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
