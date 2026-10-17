import React, { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Checkbox } from '@/components/checkbox/checkbox';
import { Label } from '@/components/label/label';
import { OptionSelect } from '@/components/option-select/option-select';
import { cn } from '@/lib/utils';
import {
    RULES,
    normalizeConfig,
    type LintConfig,
    type LintSeverity,
    type RuleId,
} from '../../../shared/lint';

export interface LintSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    config: LintConfig;
    onSave: (config: LintConfig) => void;
}

const SEVERITY_OPTIONS = [
    { value: 'error', label: 'Error' },
    { value: 'warning', label: 'Warning' },
    { value: 'info', label: 'Info' },
];

type NameStyle = 'auto' | 'snake_case' | 'camelCase';
type TableNames = 'consistent' | 'plural' | 'singular' | 'any';

export const LintSettingsDialog: React.FC<LintSettingsDialogProps> = ({
    open,
    onOpenChange,
    config,
    onSave,
}) => {
    const [draft, setDraft] = useState<LintConfig>(config);
    const contentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (open) setDraft(config);
    }, [open, config]);

    const rule = (id: RuleId) => {
        const info = RULES.find((r) => r.id === id)!;
        return {
            enabled: draft.rules?.[id]?.enabled ?? info.defaultEnabled,
            severity: draft.rules?.[id]?.severity ?? info.defaultSeverity,
        };
    };
    const setRule = (
        id: RuleId,
        patch: { enabled?: boolean; severity?: LintSeverity }
    ) =>
        setDraft((d) => ({
            ...d,
            rules: { ...d.rules, [id]: { ...d.rules?.[id], ...patch } },
        }));
    const enabledCount = RULES.filter((r) => rule(r.id).enabled).length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                ref={contentRef}
                className="max-w-2xl gap-5 p-0 focus:outline-none"
                showClose
                // the first checkbox would otherwise open with its focus ring on
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    contentRef.current?.focus();
                }}
            >
                <DialogHeader className="space-y-1 px-6 pr-12 pt-6">
                    <DialogTitle>Lint settings</DialogTitle>
                    <DialogDescription>
                        Choose which rules run for this diagram and how serious
                        each one is.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-5 px-6">
                    <section className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-sm font-medium">Rules</h3>
                            <span className="text-xs text-muted-foreground">
                                {enabledCount} of {RULES.length} on
                            </span>
                        </div>
                        <ul
                            className="max-h-[min(24rem,45vh)] divide-y overflow-y-auto rounded-lg border"
                            aria-label="Rules"
                        >
                            {RULES.map((r) => {
                                const s = rule(r.id);
                                return (
                                    <li
                                        key={r.id}
                                        className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                                    >
                                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                                            <Checkbox
                                                aria-label={`Enable ${r.title}`}
                                                checked={s.enabled}
                                                onCheckedChange={(checked) =>
                                                    setRule(r.id, {
                                                        enabled:
                                                            checked === true,
                                                    })
                                                }
                                                className="mt-0.5"
                                            />
                                            <span
                                                className={cn(
                                                    'flex min-w-0 flex-col gap-0.5',
                                                    !s.enabled && 'opacity-60'
                                                )}
                                            >
                                                <span className="font-medium leading-snug">
                                                    {r.title}
                                                </span>
                                                <span className="text-xs leading-snug text-muted-foreground">
                                                    {r.description}
                                                </span>
                                            </span>
                                        </label>
                                        <OptionSelect
                                            size="sm"
                                            className={cn(
                                                'w-28 shrink-0',
                                                !s.enabled && 'opacity-60'
                                            )}
                                            aria-label={`Severity for ${r.title}`}
                                            value={s.severity}
                                            onValueChange={(v) =>
                                                setRule(r.id, {
                                                    severity: v as LintSeverity,
                                                })
                                            }
                                            options={SEVERITY_OPTIONS}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                    <section className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">Naming</h3>
                        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="lint-name-style">
                                    Name style
                                </Label>
                                <OptionSelect
                                    id="lint-name-style"
                                    aria-label="Name style"
                                    value={draft.naming?.style ?? 'auto'}
                                    onValueChange={(v) =>
                                        setDraft((d) => ({
                                            ...d,
                                            naming: {
                                                ...d.naming,
                                                style: v as NameStyle,
                                            },
                                        }))
                                    }
                                    options={[
                                        {
                                            value: 'auto',
                                            label: 'Detect from the diagram',
                                        },
                                        {
                                            value: 'snake_case',
                                            label: 'snake_case',
                                        },
                                        {
                                            value: 'camelCase',
                                            label: 'camelCase',
                                        },
                                    ]}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="lint-table-names">
                                    Table names
                                </Label>
                                <OptionSelect
                                    id="lint-table-names"
                                    aria-label="Table names"
                                    value={draft.naming?.tables ?? 'consistent'}
                                    onValueChange={(v) =>
                                        setDraft((d) => ({
                                            ...d,
                                            naming: {
                                                ...d.naming,
                                                tables: v as TableNames,
                                            },
                                        }))
                                    }
                                    options={[
                                        {
                                            value: 'consistent',
                                            label: 'Consistent',
                                        },
                                        { value: 'plural', label: 'Plural' },
                                        {
                                            value: 'singular',
                                            label: 'Singular',
                                        },
                                        {
                                            value: 'any',
                                            label: 'Do not check',
                                        },
                                    ]}
                                />
                            </div>
                        </div>
                    </section>
                </div>
                <DialogFooter className="items-center gap-2 border-t px-6 py-4 sm:justify-between sm:space-x-0">
                    <Button
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setDraft({})}
                    >
                        Reset to defaults
                    </Button>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                onSave(normalizeConfig(draft));
                                onOpenChange(false);
                            }}
                        >
                            Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
