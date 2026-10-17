import React, { useState } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { SearchInput } from '@/components/qubdi/search-input';
import { usePagedList } from '@/hooks/use-paged-list';
import { api } from '@/lib/qubdi/api';
import { cn } from '@/lib/utils';

export interface ChosenProject {
    id: string;
    name: string;
}

/** The searchable list. It only exists while the popover is open, so it asks the server then. */
const ProjectChoices: React.FC<{
    onChoose: (project: ChosenProject) => void;
}> = ({ onChoose }) => {
    const list = usePagedList(
        ({ page, limit, q }) => api.adminListProjects({ page, limit, q }),
        { limit: 20 }
    );
    const more = list.total > list.items.length;

    return (
        <div className="flex flex-col gap-1">
            <SearchInput
                value={list.query}
                onChange={list.setQuery}
                placeholder="Search projects…"
                label="Search projects"
            />
            <ul
                aria-label="Matching projects"
                className="max-h-48 min-h-10 overflow-y-auto rounded-md border"
            >
                {list.initialLoading ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                        Loading…
                    </li>
                ) : list.items.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                        {list.query
                            ? 'No project matches.'
                            : 'There are no projects.'}
                    </li>
                ) : (
                    list.items.map((p) => (
                        <li key={p.id}>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-9 w-full justify-start rounded-none px-3 font-normal"
                                onClick={() =>
                                    onChoose({ id: p.id, name: p.name })
                                }
                            >
                                <span className="truncate">{p.name}</span>
                            </Button>
                        </li>
                    ))
                )}
            </ul>
            {more ? (
                <p className="px-1 text-xs text-muted-foreground">
                    Type more to narrow the search.
                </p>
            ) : null}
        </div>
    );
};

export interface ProjectFilterProps {
    value: ChosenProject | null;
    onChange: (project: ChosenProject | null) => void;
}

/**
 * Narrows a list to one project. Searched on the server a page at a time, so
 * it works however many projects there are.
 */
export const ProjectFilter: React.FC<ProjectFilterProps> = ({
    value,
    onChange,
}) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex gap-1">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        aria-label="Choose a project"
                        className="min-w-0 flex-1 justify-between font-normal"
                    >
                        <span
                            className={cn(
                                'truncate',
                                !value && 'text-muted-foreground'
                            )}
                        >
                            {value?.name ?? 'All projects'}
                        </span>
                        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                    <ProjectChoices
                        onChoose={(project) => {
                            onChange(project);
                            setOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
            {value ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Show every project"
                    onClick={() => onChange(null)}
                >
                    <X className="size-4" />
                </Button>
            ) : null}
        </div>
    );
};
