import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Copy, Info, Wand2 } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { Textarea } from '@/platform/ui/textarea';
import { OptionSelect } from '@/components/option-select/option-select';
import { editionsFor } from '@/core/model/database';
import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import type { Diagnostic } from '@/dialects/script-model';
import { toast } from '@/platform/toast/use-toast';
import {
    analyzeImport,
    buildMetadata,
    EMPTY_COUNTS,
    listProblems,
    repairText,
} from './analyze-import';
import type { Analysis } from './analyze-import';
import { methodForPaste, methodsFor, prettyJson } from './import-method';
import type { ImportMethod } from './import-method';
import { metadataScriptFor } from './metadata-scripts';
import { defaultSelection, PICKER_THRESHOLD, pickerRows } from './picker-rows';
import { TablePicker } from './table-picker';
import { useDebounced } from './use-debounced';
import { diagnosticText } from '@/lib/diagnostic-text';

/** What the box reports to the dialog around it. */
export interface ImportBoxState {
    method: ImportMethod;
    edition?: DatabaseEdition;
    analysis: Analysis;
    /** the text is waiting for the quiet period or a repair */
    pending: boolean;
}

export interface ImportBoxProps {
    databaseType: DatabaseType;
    methods?: readonly ImportMethod[];
    initialMethod?: ImportMethod;
    /** names the new diagram when the text carries no name */
    diagramName?: string;
    onChange: (state: ImportBoxState) => void;
}

export const QUIET_MS = 500;
const SSMS_LIMIT = 65535;

const offsetOf = (text: string, line = 1, column = 1): number => {
    const lines = text.split('\n');
    const before = lines
        .slice(0, Math.max(0, line - 1))
        .reduce((n, l) => n + l.length + 1, 0);
    return Math.min(text.length, before + Math.max(0, column - 1));
};

const DiagnosticLine: React.FC<{ item: Diagnostic; onJump: () => void }> = ({
    item,
    onJump,
}) => {
    const isError = item.severity === 'error';
    const Icon = isError ? AlertCircle : Info;
    return (
        <li
            className={
                isError
                    ? 'text-destructive'
                    : 'text-blue-600 dark:text-blue-400'
            }
        >
            <button
                type="button"
                onClick={onJump}
                className="flex items-start gap-2 text-left text-sm"
            >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span>
                    {item.line ? `${item.line}: ` : ''}
                    {diagnosticText(item.message)}
                    {item.suggestion ? (
                        <span className="block text-xs opacity-80">
                            {diagnosticText(item.suggestion)}
                        </span>
                    ) : null}
                </span>
            </button>
        </li>
    );
};

const NOT_READ: Analysis = {
    diagnostics: [],
    counts: EMPTY_COUNTS,
    blocked: false,
    fixable: false,
};

/**
 * The paste box of every import: a method switch, the text, live checks 500 ms
 * after typing stops, a repair button, and for a large metadata document a
 * choice of tables. It reports what the text would make; the dialog around it
 * decides what to do with that.
 */
export const ImportBox: React.FC<ImportBoxProps> = ({
    databaseType,
    methods,
    initialMethod,
    diagramName,
    onChange,
}) => {
    const { t } = useTranslation();
    const available = useMemo(
        () => methodsFor(databaseType, methods),
        [databaseType, methods]
    );
    const [method, setMethod] = useState<ImportMethod>(
        initialMethod && available.includes(initialMethod)
            ? initialMethod
            : (available[0] ?? 'dbml')
    );
    const [text, setText] = useState('');
    const [edition, setEdition] = useState<DatabaseEdition | undefined>();
    const [selection, setSelection] = useState<Set<string> | undefined>();
    const [repairing, setRepairing] = useState(false);
    const [repaired, setRepaired] = useState(false);
    const area = useRef<HTMLTextAreaElement>(null);

    const quiet = useDebounced(text, QUIET_MS);
    const editions = editionsFor(databaseType);

    // SQL and metadata are read at once; DBML waits for its parser to load,
    // and until it answers the box counts as pending
    const result = useMemo(
        () =>
            analyzeImport(quiet, {
                method,
                databaseType,
                edition,
                diagramName,
            }),
        [quiet, method, databaseType, edition, diagramName]
    );
    const [late, setLate] = useState<{
        result: Promise<Analysis>;
        analysis: Analysis;
    } | null>(null);
    useEffect(() => {
        if (!(result instanceof Promise)) return;
        let live = true;
        void result.then((analysis) => {
            if (live) setLate({ result, analysis });
        });
        return () => {
            live = false;
        };
    }, [result]);
    const waiting = result instanceof Promise && late?.result !== result;
    const base =
        result instanceof Promise
            ? late?.result === result
                ? late.analysis
                : NOT_READ
            : result;
    const rows = useMemo(
        () => (base.metadata ? pickerRows(base.metadata) : []),
        [base.metadata]
    );
    const needsPicker = rows.length > PICKER_THRESHOLD;
    const picked = needsPicker
        ? (selection ?? defaultSelection(rows))
        : undefined;
    // narrowing the selection rebuilds the design from the same document
    const analysis = useMemo<Analysis>(() => {
        if (!base.metadata || !picked) return base;
        const rebuilt = buildMetadata(base.metadata, {
            databaseType,
            edition,
            diagramName,
            selection: picked,
        });
        const diagnostics = [...base.diagnostics, ...rebuilt.diagnostics];
        return {
            ...base,
            ...rebuilt,
            diagnostics,
            blocked: diagnostics.some((d) => d.severity === 'error'),
        };
    }, [base, picked, databaseType, edition, diagramName]);

    const pending = text !== quiet || repairing || waiting;
    useEffect(() => {
        onChange({
            method,
            edition,
            analysis: pending ? { ...analysis, design: undefined } : analysis,
            pending,
        });
    }, [method, edition, analysis, pending, onChange]);

    const changeText = (next: string) => {
        setText(next);
        setRepaired(false);
        setSelection(undefined);
    };

    const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pasted = event.clipboardData.getData('text');
        if (!pasted) return;
        event.preventDefault();
        const el = event.currentTarget;
        const merged =
            text.slice(0, el.selectionStart) +
            pasted +
            text.slice(el.selectionEnd);
        const hint = methodForPaste(merged);
        const target = hint && available.includes(hint) ? hint : method;
        if (target !== method) setMethod(target);
        changeText(target === 'metadata' ? prettyJson(merged) : merged);
    };

    const repair = () => {
        setRepairing(true);
        setTimeout(() => {
            setText((current) => repairText(current, method, databaseType));
            setRepairing(false);
            setRepaired(true);
        }, 1000);
    };

    const jump = (item: Diagnostic) => {
        const el = area.current;
        if (!el || !item.line) return;
        const at = offsetOf(text, item.line, item.column);
        el.focus();
        el.setSelectionRange(at, at);
    };

    const script = metadataScriptFor(databaseType, edition);
    const copyScript = async () => {
        if (!script) return;
        try {
            await navigator.clipboard.writeText(script);
            toast({ title: t('editor.importing.box.scriptCopied') });
        } catch {
            toast({
                title: t('editor.importing.box.copyFailed'),
                variant: 'destructive',
            });
        }
    };

    const { shown, more } = listProblems(analysis.diagnostics);
    const warnings = analysis.diagnostics.filter(
        (d) => d.severity !== 'error' && d.message !== 'Nothing to import'
    );
    const counted =
        quiet.trim() !== '' && !pending && !analysis.blocked && analysis.design;
    const empty =
        quiet.trim() !== '' &&
        !pending &&
        !analysis.blocked &&
        !analysis.design;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                    value={method}
                    onValueChange={(v) => setMethod(v as ImportMethod)}
                >
                    <TabsList>
                        {available.map((m) => (
                            <TabsTrigger key={m} value={m}>
                                {t(`editor.importing.box.method.${m}`)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                {editions.length > 0 ? (
                    <OptionSelect
                        aria-label={t('editor.importing.box.edition')}
                        value={edition ?? ''}
                        onValueChange={(v) =>
                            setEdition(
                                v === '' ? undefined : (v as DatabaseEdition)
                            )
                        }
                        options={[
                            {
                                value: '',
                                label: t(
                                    'editor.importing.box.editionStandard'
                                ),
                            },
                            ...editions.map((e) => ({
                                value: e,
                                label: t(`editor.importing.box.editions.${e}`),
                            })),
                        ]}
                        size="sm"
                    />
                ) : null}
            </div>

            {method === 'metadata' ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p>{t('editor.importing.box.scriptIntro')}</p>
                    {script ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={copyScript}
                        >
                            <Copy /> {t('editor.importing.box.copyScript')}
                        </Button>
                    ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('editor.importing.box.noScript')}
                        </p>
                    )}
                </div>
            ) : null}

            <Textarea
                ref={area}
                value={text}
                onChange={(e) => changeText(e.target.value)}
                onPaste={onPaste}
                spellCheck={false}
                className="h-56 resize-none font-mono text-xs"
                aria-label={t(`editor.importing.box.field.${method}`)}
                placeholder={t(`editor.importing.box.placeholder.${method}`)}
            />

            {method === 'metadata' && text.length === SSMS_LIMIT ? (
                <p role="note" className="text-sm text-amber-600">
                    {t('editor.importing.box.truncated')}
                </p>
            ) : null}

            {repairing ? (
                <p className="text-sm text-muted-foreground">
                    {t('editor.importing.box.repairing')}
                </p>
            ) : null}
            {repaired && !analysis.blocked ? (
                <p className="text-sm text-green-600">
                    {t('editor.importing.box.repaired')}
                </p>
            ) : null}

            {shown.length > 0 ? (
                <ul role="alert" className="flex flex-col gap-1">
                    {shown.map((d, i) => (
                        <DiagnosticLine
                            key={i}
                            item={d}
                            onJump={() => jump(d)}
                        />
                    ))}
                    {more > 0 ? (
                        <li className="text-sm text-destructive">
                            {t('editor.importing.box.moreProblems', {
                                count: more,
                            })}
                        </li>
                    ) : null}
                </ul>
            ) : null}
            {analysis.fixable && !pending ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={repair}
                >
                    <Wand2 /> {t('editor.importing.box.repair')}
                </Button>
            ) : null}
            {warnings.length > 0 ? (
                <ul className="flex max-h-24 flex-col gap-1 overflow-auto">
                    {warnings.map((d, i) => (
                        <DiagnosticLine
                            key={i}
                            item={d}
                            onJump={() => jump(d)}
                        />
                    ))}
                </ul>
            ) : null}

            {counted ? (
                <p
                    className="text-sm text-muted-foreground"
                    data-testid="import-counts"
                >
                    {t('editor.importing.box.found', {
                        tables: t('editor.importing.box.foundTables', {
                            count: analysis.counts.tables,
                        }),
                        links: t('editor.importing.box.foundLinks', {
                            count: analysis.counts.relationships,
                        }),
                    })}
                </p>
            ) : null}
            {empty ? (
                <p className="text-sm text-muted-foreground">
                    {t('editor.importing.box.nothing')}
                </p>
            ) : null}

            {needsPicker && picked ? (
                <TablePicker
                    rows={rows}
                    selected={picked}
                    onChange={setSelection}
                />
            ) : null}
        </div>
    );
};
