import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Button } from '@/platform/ui/button';
import { Checkbox } from '@/platform/ui/checkbox';
import { Label } from '@/platform/ui/label';
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

type NameStyle = 'auto' | 'snake_case' | 'camelCase';
type TableNames = 'consistent' | 'plural' | 'singular' | 'any';

export const LintSettingsDialog: React.FC<LintSettingsDialogProps> = ({
    open,
    onOpenChange,
    config,
    onSave,
}) => {
    const { t } = useTranslation();
    const severityOptions = (['error', 'warning', 'info'] as const).map(
        (value) => ({
            value,
            label: t('qubdi.database.lintSettings.severity.' + value),
        })
    );
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
                className="max-w-2xl gap-5 p-0 focus:outline-hidden"
                showClose
                // the first checkbox would otherwise open with its focus ring on
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    contentRef.current?.focus();
                }}
            >
                <DialogHeader className="space-y-1 px-6 pr-12 pt-6">
                    <DialogTitle>
                        {t('qubdi.database.lintSettings.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('qubdi.database.lintSettings.description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-5 px-6">
                    <section className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-sm font-medium">
                                {t('qubdi.database.lintSettings.rules')}
                            </h3>
                            <span className="text-xs text-muted-foreground">
                                {t('qubdi.database.lintSettings.enabledCount', {
                                    enabled: enabledCount,
                                    total: RULES.length,
                                })}
                            </span>
                        </div>
                        <ul
                            className="max-h-[min(24rem,45vh)] divide-y overflow-y-auto rounded-lg border"
                            aria-label={t('qubdi.database.lintSettings.rules')}
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
                                                aria-label={t(
                                                    'qubdi.database.lintSettings.enableRule',
                                                    {
                                                        title: r.title,
                                                    }
                                                )}
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
                                            aria-label={t(
                                                'qubdi.database.lintSettings.severityFor',
                                                {
                                                    title: r.title,
                                                }
                                            )}
                                            value={s.severity}
                                            onValueChange={(v) =>
                                                setRule(r.id, {
                                                    severity: v as LintSeverity,
                                                })
                                            }
                                            options={severityOptions}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                    <section className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium">
                            {t('qubdi.database.lintSettings.naming')}
                        </h3>
                        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="lint-name-style">
                                    {t('qubdi.database.lintSettings.nameStyle')}
                                </Label>
                                <OptionSelect
                                    id="lint-name-style"
                                    aria-label={t(
                                        'qubdi.database.lintSettings.nameStyle'
                                    )}
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
                                            label: t(
                                                'qubdi.database.lintSettings.styleAuto'
                                            ),
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
                                    {t(
                                        'qubdi.database.lintSettings.tableNames'
                                    )}
                                </Label>
                                <OptionSelect
                                    id="lint-table-names"
                                    aria-label={t(
                                        'qubdi.database.lintSettings.tableNames'
                                    )}
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
                                            label: t(
                                                'qubdi.database.lintSettings.tablesConsistent'
                                            ),
                                        },
                                        {
                                            value: 'plural',
                                            label: t(
                                                'qubdi.database.lintSettings.tablesPlural'
                                            ),
                                        },
                                        {
                                            value: 'singular',
                                            label: t(
                                                'qubdi.database.lintSettings.tablesSingular'
                                            ),
                                        },
                                        {
                                            value: 'any',
                                            label: t(
                                                'qubdi.database.lintSettings.tablesAny'
                                            ),
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
                        {t('qubdi.database.lintSettings.reset')}
                    </Button>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            {t('qubdi.database.lintSettings.cancel')}
                        </Button>
                        <Button
                            onClick={() => {
                                onSave(normalizeConfig(draft));
                                onOpenChange(false);
                            }}
                        >
                            {t('qubdi.database.lintSettings.save')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
