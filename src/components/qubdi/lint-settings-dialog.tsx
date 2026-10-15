import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
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

export const LintSettingsDialog: React.FC<LintSettingsDialogProps> = ({
    open,
    onOpenChange,
    config,
    onSave,
}) => {
    const [draft, setDraft] = useState<LintConfig>(config);
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl" showClose>
                <DialogHeader>
                    <DialogTitle>Lint settings</DialogTitle>
                    <DialogDescription>
                        Choose which rules run for this diagram and how serious
                        each one is.
                    </DialogDescription>
                </DialogHeader>
                <ul
                    className="flex max-h-80 flex-col gap-2 overflow-y-auto"
                    aria-label="Rules"
                >
                    {RULES.map((r) => {
                        const s = rule(r.id);
                        return (
                            <li
                                key={r.id}
                                className="flex items-start justify-between gap-3 text-sm"
                            >
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        aria-label={`Enable ${r.title}`}
                                        checked={s.enabled}
                                        onChange={(e) =>
                                            setRule(r.id, {
                                                enabled: e.target.checked,
                                            })
                                        }
                                    />
                                    <span>
                                        <span className="font-medium">
                                            {r.title}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {r.description}
                                        </span>
                                    </span>
                                </label>
                                <OptionSelect
                                    size="sm"
                                    className="w-28 shrink-0"
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
                <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                        Name style
                        <OptionSelect
                            aria-label="Name style"
                            className="w-56"
                            value={draft.naming?.style ?? 'auto'}
                            onValueChange={(v) =>
                                setDraft((d) => ({
                                    ...d,
                                    naming: {
                                        ...d.naming,
                                        style: v as
                                            | 'auto'
                                            | 'snake_case'
                                            | 'camelCase',
                                    },
                                }))
                            }
                            options={[
                                {
                                    value: 'auto',
                                    label: 'Detect from the diagram',
                                },
                                { value: 'snake_case', label: 'snake_case' },
                                { value: 'camelCase', label: 'camelCase' },
                            ]}
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        Table names
                        <OptionSelect
                            aria-label="Table names"
                            className="w-40"
                            value={draft.naming?.tables ?? 'consistent'}
                            onValueChange={(v) =>
                                setDraft((d) => ({
                                    ...d,
                                    naming: {
                                        ...d.naming,
                                        tables: v as
                                            | 'consistent'
                                            | 'plural'
                                            | 'singular'
                                            | 'any',
                                    },
                                }))
                            }
                            options={[
                                { value: 'consistent', label: 'Consistent' },
                                { value: 'plural', label: 'Plural' },
                                { value: 'singular', label: 'Singular' },
                                { value: 'any', label: 'Do not check' },
                            ]}
                        />
                    </label>
                </div>
                <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setDraft({})}>
                        Reset to defaults
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
            </DialogContent>
        </Dialog>
    );
};
