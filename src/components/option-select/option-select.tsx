import React from 'react';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../select/select';
import {
    EMPTY_VALUE,
    fromInternalValue,
    toInternalValue,
    type SelectOption,
} from './option-select-values';

export interface OptionSelectProps {
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    'aria-label'?: string;
    id?: string;
    disabled?: boolean;
    className?: string;
    /** `sm` is a compact 32px control for tables and rows. */
    size?: 'sm' | 'default';
}

/**
 * A dropdown with the simple shape of a native <select> (a value, a list of
 * options, one change callback) drawn with the app's styled Select.
 */
export const OptionSelect: React.FC<OptionSelectProps> = ({
    value,
    onValueChange,
    options,
    placeholder,
    disabled,
    className,
    size = 'default',
    ...rest
}) => (
    <Select
        value={toInternalValue(value, options)}
        onValueChange={(v) => onValueChange(fromInternalValue(v))}
        disabled={disabled}
    >
        <SelectTrigger
            id={rest.id}
            aria-label={rest['aria-label']}
            className={cn(size === 'sm' && 'h-8 text-xs', className)}
        >
            <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
            {options.map((o) => (
                <SelectItem
                    key={o.value || EMPTY_VALUE}
                    value={o.value === '' ? EMPTY_VALUE : o.value}
                    disabled={o.disabled}
                >
                    {o.label}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);
