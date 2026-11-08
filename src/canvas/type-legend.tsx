import React from 'react';
import { Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { cn } from '@/lib/utils/utils';
import { KIND_CLASSES, LEGEND_KINDS } from './field-view';

const SAMPLE = {
    text: 'text',
    number: 'number',
    moment: 'time',
    identifier: 'id',
    flag: 'bool',
    document: 'json',
} as const;

/** The SQL type families each tint stands for. */
const MEMBERS = {
    text: ['varchar', 'text', 'char'],
    number: ['int', 'bigint', 'numeric', 'float'],
    moment: ['date', 'time', 'timestamp', 'interval'],
    identifier: ['uuid', 'guid', 'objectid'],
    flag: ['bool', 'boolean', 'bit'],
    document: ['json', 'jsonb', 'xml'],
} as const;

/**
 * The Type colours legend at the top-right: a button that opens a list
 * explaining the tints of the field-type chips. Not drawn on a phone (the
 * stylesheet hides `.qb-legend` there).
 */
export function TypeLegend() {
    const { t } = useTranslation();
    return (
        <div className="qb-legend" data-testid="type-legend">
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-card px-2.5 text-sm transition hover:bg-accent"
                    >
                        <Palette className="h-4 w-4" aria-hidden />
                        {t('canvas.legend.label')}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 rounded-[10px] p-3">
                    <ul className="space-y-1.5">
                        {LEGEND_KINDS.map((kind) => (
                            <li
                                key={kind}
                                data-kind={kind}
                                className="flex items-start gap-3"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        'mt-0.5 w-20 shrink-0 rounded-[10px] px-1.5 py-0.5 text-center font-mono text-[11px] font-normal',
                                        KIND_CLASSES[kind]
                                    )}
                                >
                                    {SAMPLE[kind]}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium leading-5">
                                        {t(`canvas.legend.${kind}`)}
                                    </span>
                                    <span className="block text-xs leading-4 text-muted-foreground">
                                        {MEMBERS[kind].join(', ')}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </PopoverContent>
            </Popover>
        </div>
    );
}
