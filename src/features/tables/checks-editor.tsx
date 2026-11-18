import React from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { planAddRule } from '@/core/commands/plan-column';
import type { Entity } from '@/core/model/entity';
import { rulesOf } from '@/core/model/lookup';
import { DebouncedTextarea } from '@/platform/panel/debounced-input';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/platform/ui/popover';

/** The check constraints of a table (EDT-147 to EDT-151). The expression is not validated. */
export const ChecksEditor: React.FC<{ entity: Entity }> = ({ entity }) => {
    const { design, locked, edit } = useEditorEnv();
    const text = useText();
    const rules = rulesOf(design, entity);
    return (
        <div className="space-y-2">
            {rules.length === 0 ? (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    {text('checks.none')}
                </p>
            ) : null}
            {rules.map((rule) => (
                <div key={rule.id} className="flex items-start gap-1">
                    <DebouncedTextarea
                        aria-label={text('checks.expression')}
                        rows={1}
                        className="min-h-8 flex-1 font-mono text-xs"
                        value={rule.expression}
                        readOnly={locked}
                        placeholder={text('checks.expressionPlaceholder')}
                        onCommit={(expression) =>
                            edit({
                                type: 'part.update',
                                entityId: entity.id,
                                part: 'rules',
                                id: rule.id,
                                patch: { expression },
                            })
                        }
                    />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label={text('checks.attributes')}
                            >
                                <MoreHorizontal />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 space-y-3">
                            <h4 className="text-sm font-semibold">
                                {text('checks.attributes')}
                            </h4>
                            {locked ? null : (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="w-full"
                                    onClick={() =>
                                        edit({
                                            type: 'part.remove',
                                            entityId: entity.id,
                                            part: 'rules',
                                            id: rule.id,
                                        })
                                    }
                                >
                                    <Trash2 />
                                    {text('checks.delete')}
                                </Button>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            ))}
            {locked ? null : (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => edit(planAddRule(entity.id))}
                >
                    <Plus />
                    {text('checks.add')}
                </Button>
            )}
        </div>
    );
};
