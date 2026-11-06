import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { useToast } from '@/platform/toast/use-toast';
import { useDiagram } from '@/qbase/use-diagram';
import { useFocusOn } from '@/qbase/use-focus-on';
import { useLayout } from '@/qbase/use-layout';
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
// the side panel animates its width for 200ms (editor-desktop-layout.tsx)
const SIDE_PANEL_SETTLE_MS = 220;

/** Schema lint: a count badge in the toolbar and a panel of findings. Works offline. */
export const LintControl: React.FC = () => {
    const { t } = useTranslation();
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

    // the diagram on the server may have been given other settings (another
    // browser, the API) since they were read: look again whenever the panel
    // or the settings dialog opens
    const configRef = useRef(config);
    configRef.current = config;
    const active = open || settingsOpen;
    useEffect(() => {
        if (!active || !user || !remoteId) return;
        let cancelled = false;
        api.getLintConfig(remoteId)
            .then((c) => {
                if (cancelled) return;
                setLintConfig(currentDiagram.id, c);
                setConfig(c);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [active, user, remoteId, currentDiagram.id]);

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
        const previous = configRef.current;
        setConfig(next);
        setLintConfig(currentDiagram.id, next);
        // the API and CLI read the same settings when the diagram is on the server
        if (remoteId) {
            const diagramId = currentDiagram.id;
            api.saveLintConfig(remoteId, next).catch(() => {
                // the server kept the old settings: so does this browser, and says so
                if (configRef.current === next) {
                    setConfig(previous);
                    setLintConfig(diagramId, previous);
                }
                toast({
                    title: t('qubdi.database.lint.saveFailedTitle'),
                    description: t('qubdi.database.lint.saveFailedBody'),
                    variant: 'destructive',
                });
            });
        }
    };

    const applyFix = async (finding: Finding) => {
        if (!finding.fix || diagram.readonly) return;
        const ops = planFix(finding.fix, diagram.tables, databaseType);
        if (!ops) {
            toast({
                title: t('qubdi.database.lint.fixStaleTitle'),
                description: t('qubdi.database.lint.fixStaleBody'),
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
        toast({ title: t('qubdi.database.lint.fixApplied') });
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
                {t('qubdi.database.lint.button')}
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
                          aria-label={t('qubdi.database.lint.panel')}
                          data-testid="lint-panel"
                          className="fixed bottom-3 right-3 top-14 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto rounded-md border bg-background p-3 text-sm shadow-lg"
                      >
                          <div className="flex items-center justify-between">
                              <h2 className="font-semibold">
                                  {t('qubdi.database.lint.heading', {
                                      errors: summary.error,
                                      warnings: summary.warning,
                                      info: summary.info,
                                  })}
                              </h2>
                              <div className="flex gap-1">
                                  <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={t(
                                          'qubdi.database.lint.settings'
                                      )}
                                      onClick={() => setSettingsOpen(true)}
                                  >
                                      <Settings2 className="size-4" />
                                  </Button>
                                  <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={t(
                                          'qubdi.database.lint.close'
                                      )}
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
                                  {t('qubdi.database.lint.clean')}
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
                                      aria-label={t(
                                          'qubdi.database.lint.severityTitle.' +
                                              sev
                                      )}
                                  >
                                      <h3 className="mb-1 font-medium">
                                          {t(
                                              'qubdi.database.lint.severityTitle.' +
                                                  sev
                                          )}{' '}
                                          ({group.length})
                                      </h3>
                                      <ul className="flex flex-col gap-1">
                                          {group.map((f) => (
                                              <li
                                                  key={f.id}
                                                  data-testid="lint-finding"
                                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2"
                                              >
                                                  <button
                                                      type="button"
                                                      className="col-start-1 min-w-0 text-left [overflow-wrap:anywhere]"
                                                      title={t(
                                                          'qubdi.database.lint.showOnCanvas'
                                                      )}
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
                                                  {f.fix &&
                                                  !diagram.readonly ? (
                                                      <Button
                                                          size="sm"
                                                          variant="outline"
                                                          className="col-start-2 justify-self-end"
                                                          onClick={() =>
                                                              void applyFix(f)
                                                          }
                                                      >
                                                          {t(
                                                              'qubdi.database.lint.fix'
                                                          )}
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
