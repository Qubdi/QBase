import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { pageRange } from '@/lib/qubdi/paging';

export interface ListPagerProps {
    page: number;
    pageCount: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    disabled?: boolean;
    /** what the rows are, for the summary: "users", "projects" */
    noun?: string;
}

/** "11–20 of 43" with Previous and Next. Always the same height. */
export const ListPager: React.FC<ListPagerProps> = ({
    page,
    pageCount,
    limit,
    total,
    onPageChange,
    disabled,
    noun,
}) => {
    const { t } = useTranslation();
    const what = noun ?? t('qubdi.account.listPager.defaultNoun');
    const { from, to } = pageRange(page, limit, total);
    return (
        <div className="flex h-9 items-center justify-between gap-2 text-sm text-muted-foreground">
            <span aria-live="polite">
                {total === 0
                    ? t('qubdi.account.listPager.none', { noun: what })
                    : t('qubdi.account.listPager.range', {
                          from,
                          to,
                          total,
                          noun: what,
                      })}
            </span>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t('qubdi.account.listPager.previous')}
                    disabled={disabled || page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    <ChevronLeft />
                </Button>
                <span className="min-w-16 text-center tabular-nums">
                    {page} / {pageCount}
                </span>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t('qubdi.account.listPager.next')}
                    disabled={disabled || page >= pageCount}
                    onClick={() => onPageChange(page + 1)}
                >
                    <ChevronRight />
                </Button>
            </div>
        </div>
    );
};
