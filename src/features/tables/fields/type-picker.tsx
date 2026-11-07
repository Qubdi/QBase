import React, { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import type { UserType } from '@/core/model/user-type';
import { traitsOf } from '@/core/model/database';
import { cn } from '@/lib/utils/utils';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Input } from '@/platform/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import type { TypeDeclaration } from '@/core/model/type-declaration';
import {
    filterTypeOptions,
    optionSuffix,
    readTypedDeclaration,
    typeOptions,
} from './type-options';
import type { TypeOption } from './type-options';
import { typeLabel } from '@/core/model/type-suffix';

/**
 * The searchable type drop-down (EDT-119 to EDT-122): common types first,
 * custom types in their own group, and a typed declaration such as
 * `varchar(255)` offered as one more choice.
 */
export const TypePicker: React.FC<{
    databaseType: DatabaseType;
    userTypes: readonly UserType[];
    column: Pick<Column, 'type' | 'length' | 'precision' | 'scale' | 'isArray'>;
    disabled?: boolean;
    onPick: (option: TypeOption, declaration?: TypeDeclaration) => void;
}> = ({ databaseType, userTypes, column, disabled, onPick }) => {
    const text = useText();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const all = useMemo(
        () => typeOptions(databaseType, userTypes),
        [databaseType, userTypes]
    );
    const shown = filterTypeOptions(all, search);
    const typed = readTypedDeclaration(all, search);
    const arrays = traitsOf(databaseType).hasArrays;
    const empty =
        shown.standard.length === 0 && shown.custom.length === 0 && !typed;

    const choose = (option: TypeOption, declaration?: TypeDeclaration) => {
        onPick(option, declaration);
        setOpen(false);
        setSearch('');
    };

    const row = (option: TypeOption) => {
        const suffix = optionSuffix(option, column, arrays);
        const current =
            option.ref.id.toLowerCase() === column.type.id.toLowerCase();
        return (
            <button
                key={`${option.group}:${option.ref.id}`}
                type="button"
                role="option"
                aria-selected={current}
                className={cn(
                    'flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent',
                    current && 'bg-accent/60'
                )}
                onClick={() => choose(option)}
            >
                <span className="font-mono">
                    {option.ref.name}
                    {suffix}
                </span>
                {option.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                    </span>
                ) : null}
            </button>
        );
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearch('');
            }}
        >
            <PopoverTrigger asChild disabled={disabled}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={open}
                    className="h-8 w-36 shrink-0 justify-between px-2 font-mono text-xs"
                >
                    <span className="truncate">
                        {column.type.name
                            ? typeLabel(column, databaseType)
                            : text('fields.typePlaceholder')}
                    </span>
                    <ChevronsUpDown className="size-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
                <Input
                    aria-label={text('fields.typeSearch')}
                    placeholder={text('fields.typeSearch')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && typed)
                            choose(typed.option, typed.declaration);
                    }}
                    className="mb-2 h-8"
                />
                <div role="listbox" className="max-h-64 overflow-y-auto">
                    {typed ? (
                        <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="flex w-full rounded px-2 py-1 text-left font-mono text-sm hover:bg-accent"
                            onClick={() =>
                                choose(typed.option, typed.declaration)
                            }
                        >
                            {search.trim()}
                        </button>
                    ) : null}
                    {userTypes.length > 0 && shown.standard.length > 0 ? (
                        <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                            {text('fields.standardTypes')}
                        </p>
                    ) : null}
                    {shown.standard.map(row)}
                    {shown.custom.length > 0 ? (
                        <p className="px-2 pt-2 text-xs font-medium text-muted-foreground">
                            {text('fields.customTypes')}
                        </p>
                    ) : null}
                    {shown.custom.map(row)}
                    {empty ? (
                        <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                            {text('fields.noTypes')}
                        </p>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    );
};
