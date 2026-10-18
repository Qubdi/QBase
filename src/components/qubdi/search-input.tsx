import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/input/input';
import { cn } from '@/lib/utils';

export interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** accessible name; defaults to the placeholder */
    label?: string;
    className?: string;
}

/** A search box with a magnifier and a clear button. */
export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder,
    label,
    className,
}) => (
    <div className={cn('relative', className)}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
            type="search"
            role="searchbox"
            aria-label={label ?? placeholder}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
            <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange('')}
            >
                <X className="size-4" />
            </button>
        ) : null}
    </div>
);
