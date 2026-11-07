import React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
    canUseGin,
    offeredKeyMethods,
    planAddKey,
    planSetKeyColumns,
} from '@/core/commands/plan-column';
import type { Column } from '@/core/model/column';
import type { Entity } from '@/core/model/entity';
import type { Key, KeyMethod } from '@/core/model/key';
import { columnsOf, keysOf } from '@/core/model/lookup';
import {
    DebouncedInput,
    DebouncedTextarea,
} from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { OptionSelect } from '@/components/option-select/option-select';
import { Button } from '@/platform/ui/button';
import { Checkbox } from '@/platform/ui/checkbox';
import { Label } from '@/platform/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';

const FieldChooser: React.FC<{
    columns: readonly Column[];
    chosen: readonly string[];
    disabled?: boolean;
    onChange: (ids: string[]) => void;
}> = ({ columns, chosen, disabled, onChange }) => {
    const text = useText();
    const label =
        chosen.length === 0
            ? text('indexes.selectFields')
            : columns
                  .filter((c) => chosen.includes(c.id))
                  .map((c) => c.name)
                  .join(', ');
    return (
        <Popover>
            <PopoverTrigger asChild disabled={disabled}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={text('indexes.selectFields')}
                    className="h-8 min-w-0 flex-1 justify-start px-2 text-xs"
                >
                    <span className="truncate">{label}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 space-y-1 p-2">
                {columns.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                        {text('indexes.noFields')}
                    </p>
                ) : null}
                {columns.map((column) => (
                    <Label
                        key={column.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                    >
                        <Checkbox
                            checked={chosen.includes(column.id)}
                            onCheckedChange={(on) =>
                                // keep the order of the table's columns
                                onChange(
                                    columns
                                        .map((c) => c.id)
                                        .filter((id) =>
                                            id === column.id
                                                ? on === true
                                                : chosen.includes(id)
                                        )
                                )
                            }
                        />
                        {column.name}
                    </Label>
                ))}
            </PopoverContent>
        </Popover>
    );
};

const IndexRow: React.FC<{
    entity: Entity;
    index: Key;
    columns: readonly Column[];
}> = ({ entity, index, columns }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const methods = offeredKeyMethods(design.databaseType);
    const patch = (change: Partial<Key>) =>
        edit({
            type: 'part.update',
            entityId: entity.id,
            part: 'keys',
            id: index.id,
            patch: change,
        });
    const chosenColumns = columns.filter((c) => index.members.includes(c.id));
    const ginOk = canUseGin(chosenColumns);
    const primary = index.pk === true;

    return (
        <div
            className="flex items-center gap-1"
            data-testid={primary ? 'primary-key-index' : 'index-row'}
        >
            {primary ? (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                    {text('indexes.primaryKey')}
                </span>
            ) : null}
            <FieldChooser
                columns={columns}
                chosen={index.members}
                disabled={locked || primary}
                onChange={(ids) =>
                    edit(planSetKeyColumns(design, entity.id, index.id, ids))
                }
            />
            <Button
                type="button"
                size="sm"
                variant={index.distinct ? 'default' : 'outline'}
                aria-pressed={index.distinct}
                disabled={locked}
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => patch({ distinct: !index.distinct })}
            >
                {text('indexes.unique')}
            </Button>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        aria-label={text('indexes.attributes')}
                    >
                        <MoreHorizontal />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3">
                    <h4 className="text-sm font-semibold">
                        {text('indexes.attributes')}
                    </h4>
                    {primary ? null : (
                        <Label className="block space-y-1 text-sm">
                            <span>{text('indexes.name')}</span>
                            <DebouncedInput
                                value={index.label}
                                readOnly={locked}
                                onCommit={(label) => patch({ label })}
                            />
                        </Label>
                    )}
                    <Label className="flex items-center gap-2 text-sm">
                        <Checkbox
                            checked={index.distinct}
                            disabled={locked}
                            onCheckedChange={(v) =>
                                patch({ distinct: v === true })
                            }
                        />
                        {text('indexes.unique')}
                    </Label>
                    {methods.length > 0 && !primary ? (
                        <div className="space-y-1">
                            <Label className="text-sm">
                                {text('indexes.type')}
                            </Label>
                            <OptionSelect
                                aria-label={text('indexes.type')}
                                value={index.algorithm ?? 'btree'}
                                disabled={locked}
                                onValueChange={(v) =>
                                    patch({ algorithm: v as KeyMethod })
                                }
                                options={methods.map((m) => ({
                                    value: m,
                                    label: m,
                                    disabled: m === 'gin' && !ginOk,
                                }))}
                            />
                            {ginOk ? null : (
                                <p className="text-xs text-muted-foreground">
                                    {text('indexes.ginNeedsFields')}
                                </p>
                            )}
                        </div>
                    ) : null}
                    <Label className="block space-y-1 text-sm">
                        <span>{text('indexes.description')}</span>
                        <DebouncedTextarea
                            value={index.note ?? ''}
                            readOnly={locked}
                            placeholder={text('indexes.noDescription')}
                            onCommit={(v) =>
                                patch({ note: v === '' ? undefined : v })
                            }
                        />
                    </Label>
                    {locked || primary ? null : (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            onClick={() =>
                                edit({
                                    type: 'part.remove',
                                    entityId: entity.id,
                                    part: 'keys',
                                    id: index.id,
                                })
                            }
                        >
                            <Trash2 />
                            {text('indexes.delete')}
                        </Button>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
};

/** The indexes of a table, the primary-key index first (EDT-140 to EDT-146). */
export const IndexesEditor: React.FC<{ entity: Entity }> = ({ entity }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const columns = columnsOf(design, entity);
    const keys = keysOf(design, entity);
    const ordered = [...keys.filter((k) => k.pk), ...keys.filter((k) => !k.pk)];
    return (
        <div className="space-y-2">
            {ordered.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    {text('indexes.none')}
                </p>
            ) : null}
            {ordered.map((key) => (
                <IndexRow
                    key={key.id}
                    entity={entity}
                    index={key}
                    columns={columns}
                />
            ))}
            {locked ? null : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => edit(planAddKey(design, entity.id))}
                >
                    <Plus />
                    {text('indexes.add')}
                </Button>
            )}
        </div>
    );
};
