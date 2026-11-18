import React from 'react';
import {
    ChevronsUpDown,
    Key as KeyIcon,
    MoreHorizontal,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import {
    offeredKeyMethods,
    planAddKey,
    indexMethodProblem,
    planSetKeyColumns,
    planUpdateKey,
} from '@/core/commands/plan-column';
import type { Column } from '@/core/model/column';
import type { Entity } from '@/core/model/entity';
import {
    columnsBlockingUnique,
    methodCannotBeUnique,
} from '@/core/model/index-methods';
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
import { Switch } from '@/platform/ui/switch';

const FieldChooser: React.FC<{
    columns: readonly Column[];
    chosen: readonly string[];
    disabled?: boolean;
    onChange: (ids: string[]) => void;
}> = ({ columns, chosen, disabled, onChange }) => {
    const text = useText();
    const picked = columns.filter((c) => chosen.includes(c.id));
    return (
        <Popover>
            <PopoverTrigger asChild disabled={disabled}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={text('indexes.selectFields')}
                    className="h-8 min-w-0 flex-1 justify-between gap-1 px-2 text-xs font-normal"
                >
                    <span className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
                        {picked.length === 0 ? (
                            <span className="text-muted-foreground">
                                {text('indexes.selectFields')}
                            </span>
                        ) : (
                            picked.map((c) => (
                                <span
                                    key={c.id}
                                    className="flex items-center gap-1 rounded-full border bg-secondary px-2 text-xs"
                                >
                                    {c.name}
                                    {disabled ? null : (
                                        <X className="!size-3" />
                                    )}
                                </span>
                            ))
                        )}
                    </span>
                    <ChevronsUpDown className="!size-3.5 opacity-50" />
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
        edit(planUpdateKey(design, entity.id, index.id, change));
    // what each type of this database would say to this index
    const problems = new Map(
        methods.map((m) => [m, indexMethodProblem(design, entity.id, index, m)])
    );
    const primary = index.pk === true;
    // Why Unique cannot be switched on: a column whose type the database cannot
    // put in a unique index, or an index type that cannot be unique (hash, gin...;
    // switching it on used to change the type to btree behind the user's back).
    // An index that is already unique can always be turned off, so it is only
    // closed to being marked.
    const blockers = columnsBlockingUnique(
        design.databaseType,
        columns.filter((c) => index.members.includes(c.id))
    );
    const method = index.algorithm ?? methods[0];
    const typeBlocked =
        !primary && methodCannotBeUnique(design.databaseType, method);
    const reasons = [
        ...(blockers.length > 0
            ? [
                  text('indexes.uniqueBlocked', {
                      fields: blockers
                          .map((c) => `${c.name} (${c.type.name})`)
                          .join(', '),
                  }),
              ]
            : []),
        ...(typeBlocked
            ? [
                  text('indexes.uniqueBlockedType', {
                      type: method ?? '',
                      other: methods[0] ?? '',
                  }),
              ]
            : []),
    ];
    const uniqueBlocked = reasons.length > 0 && !index.distinct;

    return (
        <div
            className="flex items-center gap-1"
            data-testid={primary ? 'primary-key-index' : 'index-row'}
        >
            {primary ? (
                <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">
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
            {/* a disabled button takes no pointer events, so the reason is the span's tooltip */}
            <span
                className="shrink-0"
                title={uniqueBlocked ? reasons.join('\n') : undefined}
            >
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={text('indexes.unique')}
                    aria-pressed={index.distinct}
                    disabled={locked || uniqueBlocked}
                    className={
                        index.distinct
                            ? 'size-8 shrink-0 bg-accent text-orange-700 dark:text-orange-400'
                            : 'size-8 shrink-0 text-slate-700 dark:text-slate-300'
                    }
                    onClick={() => patch({ distinct: !index.distinct })}
                >
                    <KeyIcon />
                </Button>
            </span>
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
                <PopoverContent className="w-72 space-y-3">
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
                    <div className="space-y-1">
                        {/* the same switch row as Field Attributes */}
                        <Label className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                            {text('indexes.unique')}
                            <Switch
                                checked={index.distinct}
                                disabled={locked || uniqueBlocked}
                                onCheckedChange={(v) => patch({ distinct: v })}
                            />
                        </Label>
                        {reasons.map((reason) => (
                            <p
                                key={reason}
                                className="text-xs text-slate-600 dark:text-slate-300"
                            >
                                {reason}
                            </p>
                        ))}
                    </div>
                    {methods.length > 0 && !primary ? (
                        <div className="space-y-1">
                            <Label className="text-sm">
                                {text('indexes.type')}
                            </Label>
                            <OptionSelect
                                aria-label={text('indexes.type')}
                                value={method}
                                disabled={locked}
                                onValueChange={(v) =>
                                    patch({ algorithm: v as KeyMethod })
                                }
                                options={methods.map((m) => ({
                                    value: m,
                                    label: m,
                                    disabled: problems.get(m) !== undefined,
                                }))}
                            />
                            {methods.map((m) => {
                                const problem = problems.get(m);
                                // "cannot be unique" is not written out for every type: with
                                // Unique on, those types are greyed in the list, and the
                                // Unique row above says why when it is the type that refuses
                                return problem && problem !== 'notUnique' ? (
                                    <p
                                        key={m}
                                        className="text-xs text-slate-600 dark:text-slate-300"
                                    >
                                        {m}:{' '}
                                        {text(`indexes.problem.${problem}`)}
                                    </p>
                                ) : null;
                            })}
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
                <p className="text-xs text-slate-600 dark:text-slate-300">
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
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => edit(planAddKey(design, entity.id))}
                >
                    <Plus />
                    {text('indexes.add')}
                </Button>
            )}
        </div>
    );
};
