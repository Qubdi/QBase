import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, GripVertical, Info, Wand2 } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/platform/ui/tabs';
import { Textarea } from '@/platform/ui/textarea';
import { CodeView } from './code-view';
import { EditionIcon, MethodIcon } from './chip-icons';
import {
    dumpCommandFor,
    DBML_SAMPLE,
    hasPsqlTab,
    PSQL_COMMAND,
} from './import-instructions';
import { cn } from '@/lib/utils/utils';
import { editionsFor } from '@/core/model/database';
import type { DatabaseEdition, DatabaseType } from '@/core/model/database';
import type { Diagnostic } from '@/dialects/script-model';
import { copyText } from '@/platform/clipboard/copy-text';
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
const DEFAULT_LEFT = 350;
const MIN_LEFT = 260;
const MAX_LEFT = 560;
const clampLeft = (w: number) => Math.min(MAX_LEFT, Math.max(MIN_LEFT, w));

/** Two columns from the md breakpoint up; one stacked column below it. */
const useIsWide = () => {
    const [wide, setWide] = useState(
        () =>
            typeof window === 'undefined' ||
            window.matchMedia?.('(min-width: 768px)').matches !== false
    );
    useEffect(() => {
        const q = window.matchMedia?.('(min-width: 768px)');
        if (!q) return;
        const on = () => setWide(q.matches);
        q.addEventListener('change', on);
        return () => q.removeEventListener('change', on);
    }, []);
    return wide;
};
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
    const gutter = useRef<HTMLDivElement>(null);
    const grid = useRef<HTMLDivElement>(null);
    const dragFrom = useRef<{ x: number; w: number } | undefined>(undefined);
    const [client, setClient] = useState<'client' | 'psql'>('client');
    const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
    const wide = useIsWide();

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
    // memoised: a new Set on every render would rebuild the analysis, which the
    // parent stores in state, which renders again, without end
    const picked = useMemo(
        () => (needsPicker ? (selection ?? defaultSelection(rows)) : undefined),
        [needsPicker, selection, rows]
    );
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

    const repairTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(repairTimer.current), []);
    const repair = () => {
        setRepairing(true);
        clearTimeout(repairTimer.current);
        repairTimer.current = setTimeout(() => {
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
    const copyCode = async (code: string) => {
        if (await copyText(code)) {
            toast({ title: t('editor.importing.box.scriptCopied') });
        }
    };
    const copyScript = async () => {
        if (!script) return;
        if (await copyText(script)) {
            toast({ title: t('editor.importing.box.scriptCopied') });
        }
    };

    // "Found 2 tables to import." says what the counts line below says again
    const listed = analysis.diagnostics.filter(
        (d) => d.code !== 'found-tables'
    );
    const { shown, more } = listProblems(listed);
    const warnings = listed.filter(
        (d) => d.severity !== 'error' && d.code !== 'nothing-to-import'
    );
    const counted =
        quiet.trim() !== '' && !pending && !analysis.blocked && analysis.design;
    const empty =
        quiet.trim() !== '' &&
        !pending &&
        !analysis.blocked &&
        !analysis.design;

    const choiceClass = (on: boolean) =>
        cn(
            'inline-flex h-6 items-center gap-1.5 rounded-md border border-input px-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            on && 'bg-slate-200 text-accent-foreground dark:bg-secondary'
        );
    const dump = dumpCommandFor(databaseType);
    const psqlSwitch = hasPsqlTab(databaseType, method);

    // the script to run, or the psql command, or why there is none
    const scriptView =
        script && psqlSwitch && client === 'psql' ? (
            <>
                <p className="text-primary">
                    {t('editor.importing.box.psqlSave')}
                </p>
                <CodeView
                    code={PSQL_COMMAND}
                    language="shell"
                    label={t('editor.importing.box.psql')}
                    className="h-[96px]"
                />
            </>
        ) : script ? (
            <CodeView
                code={script}
                language="sql"
                label={t('editor.importing.box.copyScript')}
                copyLabel={t('editor.importing.box.copyScript')}
                onCopy={copyScript}
                className="h-[198px]"
            />
        ) : (
            <p className="text-xs text-muted-foreground">
                {t('editor.importing.box.noScript')}
            </p>
        );

    return (
        <div
            ref={grid}
            className="grid min-h-0 md:h-[500px]"
            style={{
                gridTemplateColumns: wide
                    ? `${leftWidth}px 9px minmax(0,1fr)`
                    : undefined,
            }}
        >
            <div className="flex flex-col gap-3 overflow-auto rounded-md bg-accent/40 p-2 text-sm">
                {editions.length > 0 ? (
                    <div
                        role="radiogroup"
                        aria-label={t('editor.importing.box.edition')}
                    >
                        <p className="mb-1 text-primary">
                            {t('editor.importing.box.edition')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                {
                                    value: '',
                                    label: t(
                                        'editor.importing.box.editionStandard'
                                    ),
                                },
                                ...editions.map((e) => ({
                                    value: e as string,
                                    label: t(
                                        `editor.importing.box.editions.${e}`
                                    ),
                                })),
                            ].map((o) => (
                                <button
                                    key={o.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={(edition ?? '') === o.value}
                                    className={choiceClass(
                                        (edition ?? '') === o.value
                                    )}
                                    onClick={() =>
                                        setEdition(
                                            o.value === ''
                                                ? undefined
                                                : (o.value as DatabaseEdition)
                                        )
                                    }
                                >
                                    <EditionIcon
                                        databaseType={databaseType}
                                        edition={o.value}
                                    />
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                <div
                    role="radiogroup"
                    aria-label={t('editor.importing.box.methodLabel')}
                >
                    <p className="mb-1 text-primary">
                        {t('editor.importing.box.methodLabel')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {available.map((m) => (
                            <button
                                key={m}
                                type="button"
                                role="radio"
                                aria-checked={method === m}
                                className={choiceClass(method === m)}
                                onClick={() => setMethod(m)}
                            >
                                <MethodIcon method={m} />
                                {t(`editor.importing.box.method.${m}`)}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <p className="font-semibold">
                        {t('editor.importing.box.instructions')}
                    </p>
                    {method === 'metadata' ? (
                        <>
                            <p className="text-primary">
                                {t('editor.importing.box.scriptIntro')}
                            </p>
                            {psqlSwitch ? (
                                <Tabs
                                    value={client}
                                    onValueChange={(v) =>
                                        setClient(v as 'client' | 'psql')
                                    }
                                    className="flex flex-col gap-2"
                                >
                                    <TabsList className="h-8 self-start rounded-lg border-0 bg-secondary p-1">
                                        <TabsTrigger
                                            value="client"
                                            className="h-6 flex-none rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                                        >
                                            {t('editor.importing.box.dbClient')}
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="psql"
                                            className="h-6 flex-none rounded-md data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                                        >
                                            {t('editor.importing.box.psql')}
                                        </TabsTrigger>
                                    </TabsList>
                                    {/* the panel of the chosen tab: without one, the tab's aria-controls points at nothing */}
                                    <TabsContent
                                        value={client}
                                        className="mt-0 flex flex-col gap-2"
                                    >
                                        {scriptView}
                                    </TabsContent>
                                </Tabs>
                            ) : (
                                scriptView
                            )}
                        </>
                    ) : null}
                    {method === 'sql' && dump ? (
                        <>
                            <p className="text-primary">
                                {t('editor.importing.box.sqlInstall', {
                                    tool: dump.tool,
                                })}
                            </p>
                            <p className="text-primary">
                                {t('editor.importing.box.sqlRun')}
                            </p>
                            <CodeView
                                code={dump.template}
                                language="shell"
                                label={dump.tool}
                                copyLabel={t('editor.importing.box.copyScript')}
                                onCopy={() => void copyCode(dump.template)}
                                className="h-[62px]"
                            />
                            <p className="text-primary">
                                {t('editor.importing.box.example')}
                            </p>
                            <CodeView
                                code={dump.example}
                                language="shell"
                                label={t('editor.importing.box.example')}
                                copyLabel={t('editor.importing.box.copyScript')}
                                onCopy={() => void copyCode(dump.example)}
                                className="h-[62px]"
                            />
                        </>
                    ) : null}
                    {method === 'dbml' ? (
                        <>
                            <p className="text-primary">
                                {t('editor.importing.box.pasteHere.dbml')}
                            </p>
                            <p className="text-xs font-medium text-primary">
                                {t('editor.importing.box.example')}
                            </p>
                            <CodeView
                                code={DBML_SAMPLE}
                                language="dbml"
                                label={t('editor.importing.box.example')}
                                className="h-[236px]"
                            />
                        </>
                    ) : (
                        <p className="text-primary">
                            {t(`editor.importing.box.pasteHere.${method}`)}
                        </p>
                    )}
                </div>
            </div>

            {wide ? (
                <div
                    role="slider"
                    aria-orientation="vertical"
                    aria-label={t('editor.importing.box.resize')}
                    aria-valuenow={leftWidth}
                    aria-valuemin={MIN_LEFT}
                    aria-valuemax={MAX_LEFT}
                    tabIndex={0}
                    className="flex cursor-col-resize touch-none items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dragFrom.current = { x: e.clientX, w: leftWidth };
                    }}
                    onPointerMove={(e) => {
                        if (!dragFrom.current) return;
                        setLeftWidth(
                            clampLeft(
                                dragFrom.current.w +
                                    e.clientX -
                                    dragFrom.current.x
                            )
                        );
                    }}
                    onPointerUp={() => (dragFrom.current = undefined)}
                    onKeyDown={(e) => {
                        const step =
                            e.key === 'ArrowRight'
                                ? 20
                                : e.key === 'ArrowLeft'
                                  ? -20
                                  : 0;
                        if (!step) return;
                        e.preventDefault();
                        setLeftWidth((w) => clampLeft(w + step));
                    }}
                >
                    <GripVertical className="size-3.5" aria-hidden />
                </div>
            ) : null}

            <div className="flex min-h-0 flex-col gap-2 overflow-auto md:pl-0">
                <div className="relative flex min-h-[200px] flex-1 overflow-hidden rounded-md border">
                    <span className="pointer-events-none absolute right-2 top-1 z-10 text-xs text-muted-foreground">
                        {t(`editor.importing.box.output.${method}`)}
                    </span>
                    <div
                        aria-hidden
                        ref={gutter}
                        className="select-none overflow-hidden bg-background pl-3 pr-3 pt-2 text-right font-mono text-[13px] leading-[19px] text-[#237893] dark:text-[#858585]"
                    >
                        {Array.from(
                            { length: Math.max(1, text.split('\n').length) },
                            (_, n) => (
                                <div key={n}>{n + 1}</div>
                            )
                        )}
                    </div>
                    <Textarea
                        ref={area}
                        value={text}
                        onChange={(e) => changeText(e.target.value)}
                        onPaste={onPaste}
                        onScroll={(e) => {
                            if (gutter.current)
                                gutter.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
                        }}
                        spellCheck={false}
                        className="min-h-0 flex-1 resize-none rounded-none border-0 px-0 pt-2 font-mono text-[13px] leading-[19px] shadow-none"
                        aria-label={t(`editor.importing.box.field.${method}`)}
                        placeholder={t(
                            `editor.importing.box.placeholder.${method}`
                        )}
                    />
                </div>

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
        </div>
    );
};
