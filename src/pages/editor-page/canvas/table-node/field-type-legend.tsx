import React from 'react';
import { Palette } from 'lucide-react';
import { Button } from '@/components/button/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { FIELD_TYPE_KIND_CLASS, type FieldTypeKind } from './field-type-kind';

const LEGEND: { kind: FieldTypeKind; label: string; examples: string }[] = [
    { kind: 'text', label: 'Text / other', examples: 'varchar, text, char' },
    {
        kind: 'number',
        label: 'Number',
        examples: 'int, bigint, numeric, float',
    },
    {
        kind: 'time',
        label: 'Date & time',
        examples: 'date, time, timestamp, interval',
    },
    { kind: 'id', label: 'Identifier', examples: 'uuid, guid, objectid' },
    { kind: 'bool', label: 'Boolean', examples: 'bool, boolean, bit' },
    { kind: 'json', label: 'JSON / XML', examples: 'json, jsonb, xml' },
];

/** What each tint of a column's type chip means. */
export const FieldTypeLegend: React.FC = () => (
    <Popover>
        <PopoverTrigger asChild>
            <Button
                variant="outline"
                size="sm"
                className="gap-1 bg-background/80 backdrop-blur"
            >
                <Palette className="size-4" />
                Type colours
            </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 p-3">
            <ul className="flex flex-col gap-2 text-xs">
                {LEGEND.map(({ kind, label, examples }) => (
                    <li key={kind} className="flex items-center gap-2">
                        <span
                            className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] ${FIELD_TYPE_KIND_CLASS[kind]}`}
                        >
                            {kind}
                        </span>
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                            <span className="font-medium">{label}</span>
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
