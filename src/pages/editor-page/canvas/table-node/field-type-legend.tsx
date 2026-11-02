import React from 'react';
import { useTranslation } from 'react-i18next';
import { Palette } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { FIELD_TYPE_KIND_CLASS, type FieldTypeKind } from './field-type-kind';

// the examples are type names, which are the same in every language
const LEGEND: { kind: FieldTypeKind; examples: string }[] = [
    { kind: 'text', examples: 'varchar, text, char' },
    { kind: 'number', examples: 'int, bigint, numeric, float' },
    { kind: 'time', examples: 'date, time, timestamp, interval' },
    { kind: 'id', examples: 'uuid, guid, objectid' },
    { kind: 'bool', examples: 'bool, boolean, bit' },
    { kind: 'json', examples: 'json, jsonb, xml' },
];

/** What each tint of a column's type chip means. */
export const FieldTypeLegend: React.FC = () => {
    const { t } = useTranslation();
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 bg-background/80 backdrop-blur"
                >
                    <Palette className="size-4" />
                    {t('qubdi.workspace.typeLegend.button')}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="w-64 p-3">
                <ul className="flex flex-col gap-2 text-xs">
                    {LEGEND.map(({ kind, examples }) => (
                        <li key={kind} className="flex items-center gap-2">
                            <span
                                className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] ${FIELD_TYPE_KIND_CLASS[kind]}`}
                            >
                                {kind}
                            </span>
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                <span className="font-medium">
                                    {t(`qubdi.workspace.typeLegend.${kind}`)}
                                </span>
                                <span className="block text-muted-foreground">
                                    {examples}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
};
