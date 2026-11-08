import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import type { DatabaseType } from '@/core/model/database';
import { dialectFor } from '@/dialects/registry';
import { Button } from '@/platform/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { cn } from '@/lib/utils/utils';
import {
    ANALYTICAL,
    CARDS_PER_ROW,
    DATABASE_LOGOS,
    TRANSACTIONAL,
    VISIBLE_ROWS,
} from './database-groups';

const Card: React.FC<{
    type: DatabaseType;
    chosen: boolean;
    onPick: (type: DatabaseType) => void;
}> = ({ type, chosen, onPick }) => {
    const logo = DATABASE_LOGOS[type];
    return (
        <button
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onPick(type)}
            className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors hover:bg-accent',
                chosen && 'border-primary bg-accent'
            )}
        >
            {logo ? (
                <img src={logo} alt="" className="size-10" draggable={false} />
            ) : (
                <Database className="size-10" aria-hidden="true" />
            )}
            <span className="font-medium">{dialectFor(type).label}</span>
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
        <div className="flex flex-col gap-3">
            <Tabs
                defaultValue={
                    value && ANALYTICAL.includes(value)
                        ? 'analytical'
                        : 'transactional'
                }
            >
                <TabsList>
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
                        className="grid grid-cols-3 gap-3"
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
                        <div className="mt-3 flex justify-center">
                            <Button
                                variant="ghost"
                                onClick={() =>
                                    setOffset((o) => (o === 0 ? 1 : 0))
                                }
                            >
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
                        className="grid grid-cols-3 gap-3"
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
                </TabsContent>
            </Tabs>
            <Button
                variant="link"
                className="self-start px-0"
                aria-pressed={value === 'generic'}
                onClick={onGeneric}
            >
                {t('editor.designs.create.genericOption')}
            </Button>
        </div>
    );
};
