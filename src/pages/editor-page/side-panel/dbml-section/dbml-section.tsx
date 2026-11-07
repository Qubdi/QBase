import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Copy } from 'lucide-react';
import type { DiffMarks } from '@/canvas/diff-marks';
import type { Design } from '@/core/model/design';
import { buildProposal } from '@/features/dbml-diff/build-proposal';
import { diffDesigns } from '@/features/dbml-diff/diff-designs';
import type { DesignDiff } from '@/features/dbml-diff/diff-designs';
import { usePreviewStore } from '@/features/dbml-diff/preview-store';
import { exportDbml } from '@/formats/dbml/export-dbml';
import { cn } from '@/lib/utils/utils';
import { useEditorEnv } from '@/platform/panel/use-editor';
import { useText } from '@/platform/panel/use-text';
import { Button } from '@/platform/ui/button';
import { Spinner } from '@/platform/ui/spinner';
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
    'font-mono text-xs leading-4 p-2 whitespace-pre overflow-auto break-normal';

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
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const applyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const backdrop = useRef<HTMLDivElement>(null);
    const result = useMemo(
        () => exportDbml(design, { inline }),
        [design, inline]
    );

    const discard = useCallback(() => {
        clearTimeout(timer.current);
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
        if (!pending || applying) return;
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
        try {
            await navigator.clipboard.writeText(editing ? draft : result.text);
            toast({ title: text('dbml.copied') });
        } catch {
            toast({ title: text('dbml.failed'), variant: 'destructive' });
        }
    };

    const canEdit = !locked;
    const lines = draft.split('\n');
    const summary = pending
        ? text('dbml.summary', {
              added: pending.diff.tables.added.length,
              removed: pending.diff.tables.removed.length,
              changed: pending.diff.tables.changed.length,
              linksAdded: pending.diff.links.added.length,
              linksRemoved: pending.diff.links.removed.length,
          })
        : undefined;

    return (
        <div className="relative flex h-full flex-col gap-2 p-2">
            {applying ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/70"
                >
                    <Spinner />
                    <span className="text-sm">{text('dbml.applying')}</span>
                </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex-1 text-sm font-semibold">
                    {text('dbml.title')}
                </h3>
                {editing && pending ? (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-green-600 text-white hover:bg-green-700"
                            onClick={accept}
                        >
                            {text('dbml.accept')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={stopEditing}
                        >
                            {text('dbml.undo')}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-pressed={inline}
                            disabled={editing}
                            onClick={() => setInline((v) => !v)}
                        >
                            {inline
                                ? text('dbml.standardRefs')
                                : text('dbml.inlineRefs')}
                        </Button>
                        {canEdit ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={editing ? stopEditing : startEditing}
                            >
                                {editing
                                    ? text('dbml.view')
                                    : text('dbml.edit')}
                            </Button>
                        ) : null}
                    </>
                )}
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={text('dbml.copy')}
                    onClick={() => void copy()}
                >
                    <Copy />
                </Button>
            </div>
            {editing ? (
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
                    <div
                        ref={backdrop}
                        aria-hidden
                        className={cn(
                            TEXT_BOX,
                            'absolute inset-0 text-transparent'
                        )}
                    >
                        {lines.map((line, i) => (
                            <div
                                key={i}
                                data-line-error={errorLine === i + 1}
                                className={cn(
                                    'min-h-4',
                                    errorLine === i + 1 && 'bg-red-500/30'
                                )}
                            >
                                {line}
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
                            'absolute inset-0 h-full w-full resize-none bg-transparent outline-none'
                        )}
                        onChange={(event) => type(event.target.value)}
                        onScroll={(event) => {
                            const el = backdrop.current;
                            if (!el) return;
                            el.scrollTop = event.currentTarget.scrollTop;
                            el.scrollLeft = event.currentTarget.scrollLeft;
                        }}
                    />
                </div>
            ) : (
                <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
                    {result.text || text('dbml.empty')}
                </pre>
            )}
            {errorLine !== undefined ? (
                <p role="alert" className="text-xs text-red-600">
                    {errorLine === null
                        ? text('dbml.parseErrorNoLine')
                        : text('dbml.parseError', { line: errorLine })}
                </p>
            ) : summary ? (
                <p className="text-xs text-muted-foreground">{summary}</p>
            ) : null}
        </div>
    );
};
