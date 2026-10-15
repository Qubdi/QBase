import type React from 'react';
export interface SelectOption {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
}

// Radix does not allow an item with the value "", so the empty choice
// ("None", "Not set") travels under this name and is mapped back.
export const EMPTY_VALUE = '__empty__';

export const toInternalValue = (value: string, options: SelectOption[]) =>
    value === '' && options.some((o) => o.value === '') ? EMPTY_VALUE : value;

export const fromInternalValue = (value: string) =>
    value === EMPTY_VALUE ? '' : value;
