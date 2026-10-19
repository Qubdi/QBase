import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import { usePagedList } from '@/hooks/use-paged-list';
import { api, type AdminUser } from '@/lib/qubdi/api';
import { SearchInput } from './search-input';

export interface UserPickerProps {
    selected: AdminUser | null;
    onSelect: (user: AdminUser | null) => void;
    /** users that cannot be chosen, e.g. people already in the project */
    excludeIds: ReadonlySet<string>;
    /** leave admins out: they already have full access, so assigning one does nothing */
    hideAdmins?: boolean;
}

/**
 * Finds a user by email without loading all of them: type to search, click a
 * result to choose it. Works however many users the server has.
 */
export const UserPicker: React.FC<UserPickerProps> = ({
    selected,
    onSelect,
    excludeIds,
    hideAdmins = false,
}) => {
    const { t } = useTranslation();
    const list = usePagedList(
        ({ page, limit, q }) => api.adminListUsers({ page, limit, q }),
        { limit: 20 }
    );

    if (selected) {
        return (
            <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-accent px-3 text-sm text-accent-foreground">
                <span className="flex min-w-0 items-center gap-2">
                    <Check className="size-4 shrink-0" />
                    <span className="truncate">{selected.email}</span>
                </span>
                <button
                    type="button"
                    aria-label={t('qubdi.account.userPicker.change')}
                    className="rounded-xs hover:text-foreground"
                    onClick={() => onSelect(null)}
                >
                    <X className="size-4" />
                </button>
            </div>
        );
    }

    const candidates = list.items.filter(
        (u) => !excludeIds.has(u.id) && !(hideAdmins && u.isAdmin)
    );
    const more = list.total > list.items.length;

    return (
        <div className="flex flex-col gap-1">
            <SearchInput
                value={list.query}
                onChange={list.setQuery}
                placeholder={t('qubdi.account.userPicker.placeholder')}
                label={t('qubdi.account.userPicker.label')}
            />
            <ul
                className="max-h-28 min-h-10 overflow-y-auto rounded-md border md:max-h-40"
                aria-label={t('qubdi.account.userPicker.matching')}
            >
                {list.initialLoading ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                        {t('qubdi.account.userPicker.loading')}
                    </li>
                ) : candidates.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                        {list.query
                            ? t('qubdi.account.userPicker.noMatch')
                            : t('qubdi.account.userPicker.everyone')}
                        {more ? t('qubdi.account.userPicker.narrow') : ''}
                    </li>
                ) : (
                    candidates.map((u) => (
                        <li key={u.id}>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-9 w-full justify-start rounded-none px-3 font-normal"
                                onClick={() => onSelect(u)}
                            >
                                <span className="truncate">{u.email}</span>
                            </Button>
                        </li>
                    ))
                )}
            </ul>
        </div>
    );
};
