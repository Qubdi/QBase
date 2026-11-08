import React from 'react';
import { Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { cn } from '@/lib/utils/utils';
import { KIND_CLASSES, LEGEND_KINDS } from './field-view';

const SAMPLE = '\u2588\u2588\u2588';

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
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2 text-xs shadow-sm transition hover:bg-muted"
                    >
                        <Palette className="h-4 w-4" aria-hidden />
                        {t('canvas.legend.label')}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                    <ul className="space-y-1.5 text-xs">
                        {LEGEND_KINDS.map((kind) => (
                            <li
                                key={kind}
                                data-kind={kind}
                                className="flex items-center gap-2"
                            >
                                <span
                                    aria-hidden
                                    className={cn(
                                        'rounded px-1.5 py-0.5 font-mono text-[11px]',
                                        KIND_CLASSES[kind]
                                    )}
                                >
                                    {SAMPLE}
                                </span>
                                {t(`canvas.legend.${kind}`)}
                            </li>
                        ))}
                    </ul>
                </PopoverContent>
            </Popover>
        </div>
    );
}
