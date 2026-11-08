import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Database } from 'lucide-react';
import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { Button } from '@/platform/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { cn } from '@/lib/utils/utils';
import { databaseLogo } from '@/components/diagram-icon/database-logos';
import { useTheme } from '@/platform/theme/theme-context';
import {
    ANALYTICAL,
    CARDS_PER_ROW,
    TRANSACTIONAL,
    VISIBLE_ROWS,
} from './database-groups';

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
    /** puts Generic back as the chosen database */
    onGeneric: () => void;
}

/** Transactional and Analytical tabs of option cards (SHL-032, SHL-042). */
export const DatabasePicker: React.FC<DatabasePickerProps> = ({
    value,
    onPick,
    onGeneric,
}) => {
    const { t } = useTranslation();
    const [offset, setOffset] = useState(0);
    const rows = Math.ceil(TRANSACTIONAL.length / CARDS_PER_ROW);
    const shifts = rows > VISIBLE_ROWS;
    const shown = TRANSACTIONAL.slice(
        offset * CARDS_PER_ROW,
        (offset + VISIBLE_ROWS) * CARDS_PER_ROW
    );
    const label = t('editor.designs.create.titleType');
    return (
        <div className="mb-4 flex min-w-0 flex-col">
            <Tabs
                defaultValue={
                    value && ANALYTICAL.includes(value)
                        ? 'analytical'
                        : 'transactional'
                }
            >
                <TabsList className="mx-auto flex w-[416px] max-w-full">
                    <TabsTrigger value="transactional">
                        {t('editor.designs.create.tabTransactional')}
                    </TabsTrigger>
                    <TabsTrigger value="analytical">
                        {t('editor.designs.create.tabAnalytical')}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="transactional">
                    <div
                        role="radiogroup"
                        aria-label={label}
                        className="mx-auto mt-2 grid min-h-[272px] w-fit grid-cols-3 max-sm:min-h-[176px] content-start gap-4"
                    >
                        {shown.map((type) => (
                            <Card
                                key={type}
                                type={type}
                                chosen={value === type}
                                onPick={onPick}
                            />
                        ))}
                    </div>
                    {shifts ? (
                        <div className="mx-auto mt-[31px] w-[416px] max-w-full">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                aria-pressed={offset === 1}
                                onClick={() =>
                                    setOffset((o) => (o === 0 ? 1 : 0))
                                }
                            >
                                {offset === 0 ? <ChevronDown /> : <ChevronUp />}
                                {offset === 0
                                    ? t('editor.designs.create.moreDatabases')
                                    : t(
                                          'editor.designs.create.primaryDatabases'
                                      )}
                            </Button>
                        </div>
                    ) : null}
                </TabsContent>
                <TabsContent value="analytical">
                    <div
                        role="radiogroup"
                        aria-label={label}
                        className="mx-auto mt-2 grid min-h-[272px] w-fit grid-cols-3 max-sm:min-h-[176px] content-start gap-4"
                    >
                        {ANALYTICAL.map((type) => (
                            <Card
                                key={type}
                                type={type}
                                chosen={value === type}
                                onPick={onPick}
                            />
                        ))}
                    </div>
                    {/* the same height as the first tab, which has the More Databases button */}
                    <div className="h-[54px]" aria-hidden />
                </TabsContent>
            </Tabs>
            <Button
                variant="link"
                className="mx-auto mt-[5px] h-8 w-[416px] max-w-full"
                aria-pressed={value === 'generic'}
                onClick={onGeneric}
            >
                {t('editor.designs.create.genericOption')}
            </Button>
        </div>
    );
};
