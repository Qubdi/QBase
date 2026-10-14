import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
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

const selectClass =
    'h-8 rounded-md border border-input bg-background px-2 text-sm';

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
                                <select
                                    aria-label={`Severity for ${r.title}`}
                                    className={selectClass}
                                    value={s.severity}
                                    onChange={(e) =>
                                        setRule(r.id, {
                                            severity: e.target
                                                .value as LintSeverity,
                                        })
                                    }
                                >
                                    <option value="error">error</option>
                                    <option value="warning">warning</option>
                                    <option value="info">info</option>
                                </select>
                            </li>
                        );
                    })}
                </ul>
                <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                        Name style
                        <select
                            aria-label="Name style"
                            className={selectClass}
                            value={draft.naming?.style ?? 'auto'}
                            onChange={(e) =>
                                setDraft((d) => ({
                                    ...d,
                                    naming: {
                                        ...d.naming,
                                        style: e.target.value as
                                            | 'auto'
                                            | 'snake_case'
                                            | 'camelCase',
                                    },
                                }))
                            }
                        >
                            <option value="auto">
                                Detect from the diagram
                            </option>
                            <option value="snake_case">snake_case</option>
                            <option value="camelCase">camelCase</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        Table names
                        <select
                            aria-label="Table names"
                            className={selectClass}
                            value={draft.naming?.tables ?? 'consistent'}
                            onChange={(e) =>
                                setDraft((d) => ({
                                    ...d,
                                    naming: {
                                        ...d.naming,
                                        tables: e.target.value as
                                            | 'consistent'
                                            | 'plural'
                                            | 'singular'
                                            | 'any',
                                    },
                                }))
                            }
                        >
                            <option value="consistent">Consistent</option>
                            <option value="plural">Plural</option>
                            <option value="singular">Singular</option>
                            <option value="any">Do not check</option>
                        </select>
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
