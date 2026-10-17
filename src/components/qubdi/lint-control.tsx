import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, Settings2, X } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useToast } from '@/components/toast/use-toast';
import { useDiagram } from '@/hooks/use-diagram';
import { useFocusOn } from '@/hooks/use-focus-on';
import { useLayout } from '@/hooks/use-layout';
import { useQubdi } from '@/hooks/use-qubdi';
import { api } from '@/lib/qubdi/api';
import {
    getLintConfig,
    hasLintConfig,
    setLintConfig,
} from '@/lib/qubdi/lint-config-store';
import { planFix } from '@/lib/qubdi/lint-fix';
import {
    lint,
    summarizeFindings,
    type Finding,
    type LintConfig,
    type LintInput,
    type LintSeverity,
} from '../../../shared/lint';
import { LintSettingsDialog } from './lint-settings-dialog';

const SEVERITY_ORDER: LintSeverity[] = ['error', 'warning', 'info'];
const SEVERITY_CLASS: Record<LintSeverity, string> = {
    error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    warning:
        'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    info: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
};
const SEVERITY_TITLE: Record<LintSeverity, string> = {
    error: 'Errors',
    warning: 'Warnings',
    info: 'Info',
};
// the side panel animates its width for 200ms (editor-desktop-layout.tsx)
const SIDE_PANEL_SETTLE_MS = 220;

/** Schema lint: a count badge in the toolbar and a panel of findings. Works offline. */
export const LintControl: React.FC = () => {
    const diagram = useDiagram();
    const { currentDiagram, databaseType } = diagram;
    const { remoteIdFor, user } = useQubdi();
    const { focusOnTable } = useFocusOn();
    const { isSidePanelShowed, openTableFromSidebar } = useLayout();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [config, setConfig] = useState<LintConfig>(() =>
        getLintConfig(currentDiagram.id)
    );

    // settings follow the diagram being edited
    useEffect(() => {
        setConfig(getLintConfig(currentDiagram.id));
    }, [currentDiagram.id]);

    // a diagram opened on a new browser: adopt the settings stored on the server
    const remoteId = remoteIdFor(currentDiagram.id);
    useEffect(() => {
        if (!user || !remoteId || hasLintConfig(currentDiagram.id)) return;
        api.getLintConfig(remoteId)
            .then((c) => {
                setLintConfig(currentDiagram.id, c);
                setConfig(c);
            })
            .catch(() => undefined);
    }, [user, remoteId, currentDiagram.id]);

    const findings = useMemo(
        () =>
            lint(
                { ...currentDiagram, databaseType } as unknown as LintInput,
                config
            ),
        [currentDiagram, databaseType, config]
    );
    const summary = summarizeFindings(findings);

    const saveConfig = (next: LintConfig) => {
        setConfig(next);
        setLintConfig(currentDiagram.id, next);
        // the API and CLI read the same settings when the diagram is on the server
        if (remoteId)
            void api.saveLintConfig(remoteId, next).catch(() => undefined);
    };

    const applyFix = async (finding: Finding) => {
        if (!finding.fix) return;
        const ops = planFix(finding.fix, diagram.tables, databaseType);
        if (!ops) {
            toast({
                title: 'This fix no longer applies',
                description: 'The diagram changed since the check ran.',
                variant: 'destructive',
            });
            return;
        }
        // each operation goes through the editor's own undoable actions
        for (const op of ops) {
            if (op.kind === 'addIndex')
                await diagram.addIndex(op.tableId, op.index);
            if (op.kind === 'removeIndex')
                await diagram.removeIndex(op.tableId, op.indexId);
            if (op.kind === 'updateField')
                await diagram.updateField(op.tableId, op.fieldId, op.patch);
            if (op.kind === 'updateTable')
                await diagram.updateTable(op.tableId, op.patch);
        }
        toast({ title: 'Fix applied' });
    };

    const tableIdOf = (f: Finding): string | undefined =>
        'tableId' in f.target ? f.target.tableId : undefined;

    // Opens the table in the left panel, ready to edit, and zooms to it.
    const showTable = (tableId: string) => {
        openTableFromSidebar(tableId);
        // a hidden panel is still growing and moving the canvas for a moment
        if (isSidePanelShowed) focusOnTable(tableId);
        else setTimeout(() => focusOnTable(tableId), SIDE_PANEL_SETTLE_MS);
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1"
                aria-pressed={open}
                onClick={() => setOpen((v) => !v)}
            >
                <ListChecks className="size-4" />
                Lint
                {summary.total > 0 ? (
                    <span
                        data-testid="lint-badge"
                        className={`rounded-full px-1.5 text-[10px] font-semibold ${
                            SEVERITY_CLASS[
                                summary.error > 0
                                    ? 'error'
                                    : summary.warning > 0
                                      ? 'warning'
                                      : 'info'
                            ]
                        }`}
                    >
                        {summary.total}
                    </span>
                ) : null}
            </Button>
            {/* the navbar's backdrop blur makes it the containing block of fixed
                children, which would squash the panel into the navbar */}
            {open
                ? createPortal(
                      <aside
                          aria-label="Lint"
                          data-testid="lint-panel"
                          className="fixed bottom-3 right-3 top-14 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto rounded-md border bg-background p-3 text-sm shadow-lg"
                      >
                          <div className="flex items-center justify-between">
                              <h2 className="font-semibold">
                                  Schema lint ({summary.error} errors,{' '}
                                  {summary.warning} warnings, {summary.info}{' '}
                                  info)
                              </h2>
                              <div className="flex gap-1">
                                  <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Lint settings"
                                      onClick={() => setSettingsOpen(true)}
                                  >
                                      <Settings2 className="size-4" />
                                  </Button>
                                  <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Close lint"
                                      onClick={() => setOpen(false)}
                                  >
                                      <X className="size-4" />
                                  </Button>
                              </div>
                          </div>
                          {findings.length === 0 ? (
                              <p
                                  className="text-muted-foreground"
                                  data-testid="lint-clean"
                              >
                                  No problems found.
                              </p>
                          ) : null}
                          {SEVERITY_ORDER.map((sev) => {
                              const group = findings.filter(
                                  (f) => f.severity === sev
                              );
                              if (group.length === 0) return null;
                              return (
                                  <section
                                      key={sev}
                                      aria-label={SEVERITY_TITLE[sev]}
                                  >
                                      <h3 className="mb-1 font-medium">
                                          {SEVERITY_TITLE[sev]} ({group.length})
                                      </h3>
                                      <ul className="flex flex-col gap-1">
                                          {group.map((f) => (
                                              <li
                                                  key={f.id}
                                                  data-testid="lint-finding"
                                                  className="flex items-start gap-2 rounded-md border p-2"
                                              >
                                                  <button
                                                      type="button"
                                                      className="flex-1 text-left"
                                                      title="Show on the canvas"
                                                      onClick={() => {
                                                          const id =
                                                              tableIdOf(f);
                                                          if (id) showTable(id);
                                                      }}
                                                  >
                                                      <span
                                                          className={`mr-1 rounded px-1 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[f.severity]}`}
                                                      >
                                                          {f.ruleId}
                                                      </span>
                                                      {f.message}
                                                  </button>
                                                  {f.fix ? (
                                                      <Button
                                                          size="sm"
                                                          variant="outline"
                                                          onClick={() =>
                                                              void applyFix(f)
                                                          }
                                                      >
                                                          Fix
                                                      </Button>
                                                  ) : null}
                                              </li>
                                          ))}
                                      </ul>
                                  </section>
                              );
                          })}
                      </aside>,
                      document.body
                  )
                : null}
            <LintSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                config={config}
                onSave={saveConfig}
            />
        </>
    );
};
