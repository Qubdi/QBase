import React from 'react';
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
    onPick: (type: DatabaseType) => void;
}> = ({ type, chosen, onPick }) => {
    const { resolvedTheme } = useTheme();
    const logo = databaseLogo(type, resolvedTheme);
    return (
        <button
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onPick(type)}
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
                        onPick={onPick}
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
