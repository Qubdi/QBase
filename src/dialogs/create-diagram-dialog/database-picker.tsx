import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, LayoutGrid } from 'lucide-react';
import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { Button } from '@/platform/ui/button';
import { cn } from '@/lib/utils/utils';
import { databaseLogo } from '@/components/diagram-icon/database-logos';
import { useTheme } from '@/platform/theme/theme-context';
import { DATABASES } from './database-groups';

const Card: React.FC<{
    type: DatabaseType;
    chosen: boolean;
    /** the one card in the Tab order (roving tabindex) */
    tabbable: boolean;
    onPick: (type: DatabaseType) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}> = ({ type, chosen, tabbable, onPick, onKeyDown }) => {
    const { resolvedTheme } = useTheme();
    const logo = databaseLogo(type, resolvedTheme);
    return (
        <button
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onPick(type)}
            onKeyDown={onKeyDown}
            className={cn(
                'flex size-32 flex-col items-center justify-center gap-2 rounded-md p-2 text-center text-sm text-muted-foreground transition-colors hover:bg-secondary max-sm:size-20',
                chosen && 'bg-secondary text-foreground ring-2 ring-primary'
            )}
        >
            {logo ? (
                <img
                    src={logo}
                    alt=""
                    className="w-26 max-sm:w-14"
                    draggable={false}
                />
            ) : (
                <Database
                    className="size-14 shrink-0 max-sm:size-9"
                    aria-hidden="true"
                />
            )}
            <span className={cn('text-foreground', logo && 'sr-only')}>
                {dialectFor(type).label}
            </span>
        </button>
    );
};

export interface DatabasePickerProps {
    value: DatabaseType | undefined;
    onPick: (type: DatabaseType) => void;
    /** opens the list of examples */
    onExamples?: () => void;
}

/** The option cards of the six databases (SHL-032). */
export const DatabasePicker: React.FC<DatabasePickerProps> = ({
    value,
    onPick,
    onExamples,
}) => {
    const { t } = useTranslation();
    // arrow keys move focus between the cards (Enter or Space picks one, which
    // goes on to the next step); Tab visits a single card
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        const step =
            e.key === 'ArrowRight' || e.key === 'ArrowDown'
                ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                  ? -1
                  : 0;
        if (step === 0) return;
        const cards = Array.from(
            e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="radio"]'
            ) ?? []
        );
        const at = cards.indexOf(document.activeElement as HTMLButtonElement);
        if (at < 0) return;
        e.preventDefault();
        const to = (at + step + cards.length) % cards.length;
        setStop(DATABASES[to]);
        cards[to].focus();
    };
    const [stop, setStop] = useState<DatabaseType | undefined>(undefined);
    const tabStop =
        stop ??
        (value !== undefined && DATABASES.includes(value)
            ? value
            : DATABASES[0]);
    return (
        <div className="mb-4 flex min-w-0 flex-col">
            <div
                role="radiogroup"
                aria-label={t('editor.designs.create.titleType')}
                className="mx-auto mt-2 grid w-fit grid-cols-3 content-start gap-4"
            >
                {DATABASES.map((type) => (
                    <Card
                        key={type}
                        type={type}
                        chosen={value === type}
                        tabbable={type === tabStop}
                        onPick={onPick}
                        onKeyDown={onKeyDown}
                    />
                ))}
            </div>
            {onExamples ? (
                <Button
                    variant="outline"
                    className="mx-auto mt-4 h-8 w-[416px] max-w-full text-primary"
                    onClick={onExamples}
                >
                    <LayoutGrid />
                    {t('editor.designs.create.checkExamples')}
                </Button>
            ) : null}
        </div>
    );
};
