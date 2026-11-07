import React from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import type { Column } from '@/core/model/column';
import type { DatabaseType } from '@/core/model/database';
import {
    DebouncedInput,
    DebouncedTextarea,
} from '@/platform/panel/debounced-input';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Checkbox } from '@/platform/ui/checkbox';
import { Input } from '@/platform/ui/input';
import { Label } from '@/platform/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';
import { OptionSelect } from '@/components/option-select/option-select';
import { fieldAttributeState, lengthModeOf } from './field-rules';
import type { LengthMode } from './field-rules';
import { lengthLimit, precisionRange } from './type-traits';

const numberOrUndefined = (value: string): number | undefined => {
    const n = Number(value);
    return value.trim() === '' || !Number.isFinite(n) ? undefined : n;
};

/** The "..." button of a field row and its Field Attributes popover (EDT-125 to EDT-132). */
export const AttributesPopover: React.FC<{
    databaseType: DatabaseType;
    column: Column;
    columns: readonly Column[];
    readOnly?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onChange: (patch: Partial<Column>) => void;
    onDelete: () => void;
}> = ({
    databaseType,
    column,
    columns,
    readOnly,
    open,
    onOpenChange,
    onChange,
    onDelete,
}) => {
    const text = useText();
    const state = fieldAttributeState(databaseType, column, columns);
    const mode = lengthModeOf(column);
    const limit = lengthLimit(databaseType, column.type.id);
    const range = precisionRange(databaseType);

    const setMode = (next: LengthMode) => {
        if (next === 'none') onChange({ length: undefined });
        else if (next === 'max') onChange({ length: 'max' });
        else onChange({ length: Math.min(255, limit ?? 255) });
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={text('fields.attributes')}
                >
                    <MoreHorizontal />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-72 space-y-3"
                aria-label={text('fields.attributes')}
            >
                <h4 className="text-sm font-semibold">
                    {text('fields.attributes')}
                </h4>
                <Label className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={column.unique}
                        disabled={readOnly || state.uniqueLocked}
                        onCheckedChange={(v) =>
                            onChange({ unique: v === true })
                        }
                    />
                    {text('fields.unique')}
                </Label>
                {state.showIncrement ? (
                    <Label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={column.increment === true}
                            disabled={readOnly || state.incrementLocked}
                            onCheckedChange={(v) =>
                                onChange({ increment: v === true })
                            }
                        />
                        {text('fields.autoIncrement')}
                    </Label>
                ) : null}
                {state.showArray ? (
                    <Label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={column.isArray === true}
                            disabled={readOnly}
                            onCheckedChange={(v) =>
                                onChange({
                                    isArray: v === true ? true : undefined,
                                })
                            }
                        />
                        {text('fields.array')}
                    </Label>
                ) : null}
                {state.showLength ? (
                    <div className="space-y-1">
                        <Label className="text-sm">
                            {text('fields.maxLength')}
                        </Label>
                        <div className="flex gap-2">
                            <OptionSelect
                                aria-label={text('fields.maxLength')}
                                value={mode}
                                disabled={readOnly}
                                onValueChange={(v) => setMode(v as LengthMode)}
                                options={[
                                    {
                                        value: 'none',
                                        label: text('fields.lengthNone'),
                                    },
                                    ...(state.allowsMax
                                        ? [
                                              {
                                                  value: 'max',
                                                  label: text(
                                                      'fields.lengthMax'
                                                  ),
                                              },
                                          ]
                                        : []),
                                    {
                                        value: 'custom',
                                        label: text('fields.lengthCustom'),
                                    },
                                ]}
                            />
                            {mode === 'custom' ? (
                                <Input
                                    type="number"
                                    min={1}
                                    max={limit}
                                    aria-label={text('fields.lengthCustom')}
                                    readOnly={readOnly}
                                    value={String(column.length)}
                                    onChange={(e) => {
                                        const n = numberOrUndefined(
                                            e.target.value
                                        );
                                        if (n !== undefined)
                                            onChange({
                                                length: limit
                                                    ? Math.min(n, limit)
                                                    : n,
                                            });
                                    }}
                                />
                            ) : null}
                        </div>
                    </div>
                ) : null}
                {state.showPrecision ? (
                    <div className="grid grid-cols-2 gap-2">
                        <Label className="space-y-1 text-sm">
                            <span>{text('fields.precision')}</span>
                            <Input
                                type="number"
                                min={range.minPrecision}
                                max={range.maxPrecision}
                                placeholder={String(range.defaultPrecision)}
                                readOnly={readOnly}
                                value={column.precision ?? ''}
                                onChange={(e) =>
                                    onChange({
                                        precision: numberOrUndefined(
                                            e.target.value
                                        ),
                                    })
                                }
                            />
                        </Label>
                        <Label className="space-y-1 text-sm">
                            <span>{text('fields.scale')}</span>
                            <Input
                                type="number"
                                min={0}
                                max={range.maxScale}
                                placeholder={String(range.defaultScale)}
                                readOnly={readOnly}
                                value={column.scale ?? ''}
                                onChange={(e) =>
                                    onChange({
                                        scale: numberOrUndefined(
                                            e.target.value
                                        ),
                                    })
                                }
                            />
                        </Label>
                    </div>
                ) : null}
                <Label className="block space-y-1 text-sm">
                    <span>{text('fields.default')}</span>
                    <DebouncedInput
                        value={column.default ?? ''}
                        readOnly={readOnly}
                        placeholder={text('fields.noDefault')}
                        onCommit={(v) =>
                            onChange({ default: v === '' ? undefined : v })
                        }
                    />
                </Label>
                <Label className="block space-y-1 text-sm">
                    <span>{text('fields.description')}</span>
                    <DebouncedTextarea
                        value={column.comments ?? ''}
                        readOnly={readOnly}
                        placeholder={text('fields.noDescription')}
                        onCommit={(v) =>
                            onChange({ comments: v === '' ? undefined : v })
                        }
                    />
                </Label>
                {readOnly ? null : (
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={onDelete}
                    >
                        <Trash2 />
                        {text('fields.delete')}
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
};
