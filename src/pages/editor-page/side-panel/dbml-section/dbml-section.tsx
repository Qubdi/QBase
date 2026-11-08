import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ArrowLeftRight,
    Check,
    Copy,
    Pencil,
    PencilOff,
    X,
} from 'lucide-react';
import { highlightLine } from './dbml-highlight';
import type { DiffMarks } from '@/canvas/diff-marks';
import type { Design } from '@/core/model/design';
import { buildProposal } from '@/features/dbml-diff/build-proposal';
import { diffDesigns } from '@/features/dbml-diff/diff-designs';
import type { DesignDiff } from '@/features/dbml-diff/diff-designs';
import { usePreviewStore } from '@/features/dbml-diff/preview-store';
import type { Diagnostic } from '@/dialects/script-model';
import { diagnosticText } from '@/lib/diagnostic-text';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { cn } from '@/lib/utils/utils';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Spinner } from '@/platform/ui/spinner';
import { copyText } from '@/platform/clipboard/copy-text';
import { toast } from '@/platform/toast/use-toast';
import { importDbml } from '@/formats/dbml/import-dbml';
import { selectPanel } from '@/store/selectors';
import { useEditorStore, useEditorStoreApi } from '@/store/store-context';

/** The overlay is painted this long before a large change is applied. */
export const APPLY_DELAY_MS = 30;

/** How long the person must stop typing before the text is parsed (EDT-239). */
export const PARSE_DELAY_MS = 1000;

interface Pending {
    parsed: Design;
    diff: DesignDiff;
}

const TEXT_BOX =
    'font-mono text-sm leading-[19px] py-1 pl-1 pr-12 whitespace-pre overflow-auto break-normal';

const ICON_BUTTON = 'size-[30px] shrink-0 bg-background shadow-sm';

/** The line numbers; they follow the vertical scroll of the text beside them. */
const Gutter = React.forwardRef<
    HTMLDivElement,
    { count: number; errorLine?: number | null }
>(({ count, errorLine }, ref) => (
    <div
        ref={ref}
        aria-hidden
        className="absolute inset-y-0 left-0 w-12 select-none overflow-hidden py-1 pr-2 text-right font-mono text-sm leading-[19px] text-sky-800 dark:text-sky-300"
    >
        {Array.from({ length: count }, (_, i) => (
            <div
                key={i}
                className={cn(
                    errorLine === i + 1 &&
                        'font-bold text-red-700 dark:text-red-400'
                )}
            >
                {i + 1}
            </div>
        ))}
    </div>
));
Gutter.displayName = 'Gutter';

/**
 * The DBML section (EDT-238 to EDT-247): the design as DBML text; in an
 * editable design the text can be edited, and after a pause the result is
 * compared with the design and drawn on the canvas as a diff, without
 * touching the design, until it is accepted or undone. This file is loaded on
 * demand: the DBML library is large.
 */
export const DbmlSection: React.FC = () => {
    const { design, locked } = useEditorEnv();
    const store = useEditorStoreApi();
    const text = useText();
    const panel = useEditorStore(selectPanel);
    const showMarks = usePreviewStore((s) => s.show);
    const clearMarks = usePreviewStore((s) => s.clear);
    const [inline, setInline] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [errorLine, setErrorLine] = useState<number | null | undefined>();
    const [pending, setPending] = useState<Pending | undefined>();
    const [applying, setApplying] = useState(false);
    // the text on screen is newer than the parse behind the preview
    const [stale, setStale] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const applyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const backdrop = useRef<HTMLDivElement>(null);
    const gutter = useRef<HTMLDivElement>(null);
    const result = useMemo((): {
        text: string;
        diagnostics: Diagnostic[];
        error?: string;
    } => {
        try {
            return exportDbml(design, { inline });
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return {
                text: text('dbml.errorText', { message: error }),
                diagnostics: [],
                error,
            };
        }
    }, [design, inline, text]);
    useEffect(() => {
        if (result.error !== undefined)
            toast({
                title: text('dbml.errorToast'),
                description: result.error,
                variant: 'destructive',
            });
    }, [result.error, text]);

    const discard = useCallback(() => {
        clearTimeout(timer.current);
        setStale(false);
        setPending(undefined);
        setErrorLine(undefined);
        clearMarks();
    }, [clearMarks]);

    // leaving the section, however it happens, drops an unaccepted preview (EDT-247)
    useEffect(
        () => () => {
            clearTimeout(applyTimer.current);
            discard();
        },
        [discard]
    );
    const away = !panel.open || panel.section !== 'dbml';
    useEffect(() => {
        if (away) {
            discard();
            setEditing(false);
        }
    }, [away, discard]);

    const parse = useCallback(
        (source: string) => {
            setStale(false);
            const current = store.getState().design;
            const imported = importDbml(source, current.databaseType, {
                name: current.name,
            });
            if (!imported.design) {
                const first =
                    imported.diagnostics.find((d) => d.severity === 'error') ??
                    imported.diagnostics[0];
                setPending(undefined);
                clearMarks();
                setErrorLine(first?.line ?? null);
                return;
            }
            setErrorLine(undefined);
            const diff = diffDesigns(current, imported.design);
            if (diff.empty) {
                setPending(undefined);
                clearMarks();
                return;
            }
            const proposal = buildProposal(current, imported.design, diff);
            const marks: DiffMarks = {
                design: proposal.preview,
                tables: proposal.tables,
                links: proposal.links,
                renames: proposal.renames,
            };
            setPending({ parsed: imported.design, diff });
            showMarks(marks);
        },
        [store, showMarks, clearMarks]
    );

    const type = (value: string) => {
        setDraft(value);
        setStale(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => parse(value), PARSE_DELAY_MS);
    };

    const startEditing = () => {
        setDraft(result.text);
        setEditing(true);
    };
    const stopEditing = () => {
        discard();
        setEditing(false);
    };

    // the overlay shows while the change is applied (spec 16.1)
    const accept = () => {
        if (!pending || applying || stale) return;
        const { parsed } = pending;
        setApplying(true);
        clearTimeout(timer.current);
        applyTimer.current = setTimeout(() => {
            const current = store.getState().design;
            const proposal = buildProposal(
                current,
                parsed,
                diffDesigns(current, parsed)
            );
            const done = store
                .getState()
                .replaceDesign(proposal.accepted, { history: 'step' });
            setApplying(false);
            if (!done.ok) {
                toast({ title: text('dbml.rejected'), variant: 'destructive' });
                return;
            }
            stopEditing();
        }, APPLY_DELAY_MS);
    };

    const copy = async () => {
        if (await copyText(editing ? draft : result.text)) {
            toast({ title: text('dbml.copied') });
        }
    };

    const canEdit = !locked;
    const summary = pending
        ? text('dbml.summary', {
              added: pending.diff.tables.added.length,
              removed: pending.diff.tables.removed.length,
              changed: pending.diff.tables.changed.length,
              linksAdded: pending.diff.links.added.length,
              linksRemoved: pending.diff.links.removed.length,
          })
        : undefined;

    const shown = editing ? draft : result.text || text('dbml.empty');
    const shownLines = shown.split('\n');
    const notice =
        errorLine !== undefined ? (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {errorLine === null
                    ? text('dbml.parseErrorNoLine')
                    : text('dbml.parseError', { line: errorLine })}
            </p>
        ) : summary ? (
            <p className="text-xs text-muted-foreground">{summary}</p>
        ) : null;

    return (
        <div className="relative flex h-full flex-col gap-1 p-1">
            <h3 className="sr-only">{text('dbml.title')}</h3>
            {applying ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-background/70"
                >
                    <Spinner />
                    <span className="text-sm">{text('dbml.applying')}</span>
                </div>
            ) : null}
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px] border bg-background">
                <div className="absolute right-3 top-1 z-10 flex flex-col gap-1">
                    <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={ICON_BUTTON}
                        aria-label={text('dbml.copy')}
                        onClick={() => void copy()}
                    >
                        <Copy />
                    </Button>
                    {editing && pending ? (
                        <>
                            <Button
                                type="button"
                                size="icon"
                                className={cn(
                                    ICON_BUTTON,
                                    'bg-green-700 text-white hover:bg-green-800'
                                )}
                                aria-label={text('dbml.accept')}
                                title={text('dbml.accept')}
                                disabled={stale || applying}
                                onClick={accept}
                            >
                                <Check />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                className={cn(
                                    ICON_BUTTON,
                                    'bg-red-700 text-white hover:bg-red-800'
                                )}
                                aria-label={text('dbml.undo')}
                                title={text('dbml.undo')}
                                onClick={stopEditing}
                            >
                                <X />
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className={ICON_BUTTON}
                                aria-label={
                                    inline
                                        ? text('dbml.standardRefs')
                                        : text('dbml.inlineRefs')
                                }
                                aria-pressed={inline}
                                disabled={editing}
                                onClick={() => setInline((v) => !v)}
                            >
                                <ArrowLeftRight />
                            </Button>
                            {canEdit ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className={ICON_BUTTON}
                                    aria-label={
                                        editing
                                            ? text('dbml.view')
                                            : text('dbml.edit')
                                    }
                                    onClick={
                                        editing ? stopEditing : startEditing
                                    }
                                >
                                    {editing ? <PencilOff /> : <Pencil />}
                                </Button>
                            ) : null}
                        </>
                    )}
                </div>
                <Gutter
                    ref={gutter}
                    count={shownLines.length}
                    errorLine={editing ? errorLine : undefined}
                />
                {editing ? (
                    <>
                        <div
                            ref={backdrop}
                            aria-hidden
                            className={cn(
                                TEXT_BOX,
                                'absolute inset-y-0 left-12 right-0'
                            )}
                        >
                            {shownLines.map((line, i) => (
                                <div
                                    key={i}
                                    data-line-error={errorLine === i + 1}
                                    className={cn(
                                        'min-h-[19px]',
                                        errorLine === i + 1 &&
                                            'bg-red-500/20 underline decoration-red-600 decoration-wavy'
                                    )}
                                >
                                    {highlightLine(line)}
                                </div>
                            ))}
                        </div>
                        <textarea
                            aria-label={text('dbml.editor')}
                            aria-invalid={errorLine !== undefined}
                            spellCheck={false}
                            wrap="off"
                            value={draft}
                            className={cn(
                                TEXT_BOX,
                                'absolute inset-y-0 left-12 right-0 h-full w-[calc(100%-3rem)] resize-none bg-transparent text-transparent caret-foreground outline-none'
                            )}
                            onChange={(event) => type(event.target.value)}
                            onScroll={(event) => {
                                const el = backdrop.current;
                                if (el) {
                                    el.scrollTop =
                                        event.currentTarget.scrollTop;
                                    el.scrollLeft =
                                        event.currentTarget.scrollLeft;
                                }
                                if (gutter.current)
                                    gutter.current.scrollTop =
                                        event.currentTarget.scrollTop;
                            }}
                        />
                    </>
                ) : (
                    // a read-only code view: focusable so the keyboard can scroll it
                    <pre
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
                        role="textbox"
                        aria-readonly="true"
                        aria-multiline="true"
                        tabIndex={0}
                        aria-label={text('dbml.title')}
                        className={cn(
                            TEXT_BOX,
                            'absolute inset-y-0 left-12 right-0 m-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                        )}
                        onScroll={(event) => {
                            if (gutter.current)
                                gutter.current.scrollTop =
                                    event.currentTarget.scrollTop;
                        }}
                    >
                        {result.text
                            ? shownLines.map((line, i) => (
                                  <div key={i} className="min-h-[19px]">
                                      {highlightLine(line)}
                                  </div>
                              ))
                            : text('dbml.empty')}
                    </pre>
                )}
            </div>
            {!editing && result.diagnostics.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                    <p className="font-semibold">{text('dbml.leftOut')}</p>
                    <ul className="list-disc pl-4">
                        {result.diagnostics.map((d, i) => (
                            <li key={i}>{diagnosticText(d.message)}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {notice}
        </div>
    );
};
