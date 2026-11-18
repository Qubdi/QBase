import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpDown, Check } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/platform/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ProjectSort } from '@/lib/qubdi/api';

export const DEFAULT_PROJECT_SORT: ProjectSort = 'name_asc';

const GROUPS: readonly (readonly ProjectSort[])[] = [
    ['name_asc', 'name_desc'],
    ['created_desc', 'created_asc'],
];

const LABEL_KEYS: Record<ProjectSort, string> = {
    name_asc: 'sortNameAsc',
    name_desc: 'sortNameDesc',
    created_desc: 'sortNewest',
    created_asc: 'sortOldest',
};

export interface ProjectSortMenuProps {
    value: ProjectSort;
    onChange: (sort: ProjectSort) => void;
}

/**
 * A compact button for the project list, next to the search box: it opens a
 * short menu of orders (name, creation date) with a tick on the current one.
 * A small dot on the button shows that the order is not the default, so a list
 * that is sorted differently is easy to tell; the button's border stays as it is.
 */
export const ProjectSortMenu: React.FC<ProjectSortMenuProps> = ({
    value,
    onChange,
}) => {
    const { t } = useTranslation();
    const label = (sort: ProjectSort) =>
        t(`qubdi.adminProjects.projects.${LABEL_KEYS[sort]}`);
    const changed = value !== DEFAULT_PROJECT_SORT;
    // When the menu closes, focus goes back to its button. After a click that
    // shows the keyboard focus ring on the button for no reason, so a choice made
    // with the pointer leaves focus alone; the keyboard still gets it back.
    const pickedByPointer = React.useRef(false);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="relative size-9 shrink-0"
                    aria-label={t('qubdi.adminProjects.projects.sortLabel')}
                    title={`${t('qubdi.adminProjects.projects.sortLabel')}: ${label(value)}`}
                >
                    <ArrowUpDown className="size-4" aria-hidden />
                    {changed ? (
                        <span
                            aria-hidden
                            data-testid="sort-changed"
                            className="absolute right-1.5 top-1.5 size-[5px] rounded-full bg-primary"
                        />
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="min-w-48"
                onCloseAutoFocus={(e) => {
                    if (pickedByPointer.current) e.preventDefault();
                    pickedByPointer.current = false;
                }}
            >
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {t('qubdi.adminProjects.projects.sortHeading')}
                </DropdownMenuLabel>
                {GROUPS.map((group, i) => (
                    <React.Fragment key={group[0]}>
                        {i > 0 ? <DropdownMenuSeparator /> : null}
                        {group.map((sort) => (
                            <DropdownMenuItem
                                key={sort}
                                role="menuitemradio"
                                aria-checked={sort === value}
                                onPointerUp={() => {
                                    pickedByPointer.current = true;
                                }}
                                onSelect={() => onChange(sort)}
                            >
                                <Check
                                    className={cn(
                                        sort !== value && 'invisible'
                                    )}
                                    aria-hidden
                                />
                                {label(sort)}
                            </DropdownMenuItem>
                        ))}
                    </React.Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
