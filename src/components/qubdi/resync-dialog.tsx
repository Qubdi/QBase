import React, { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { useToast } from '@/components/toast/use-toast';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { useRedoUndoStack } from '@/hooks/use-redo-undo-stack';
import { api, errorMessage } from '@/lib/qubdi/api';
import {
    describeChange,
    describeRename,
    groupChanges,
} from '@/lib/qubdi/change-text';
import {
    applyResync,
    planResync,
    snapshotSourceKeys,
} from '@/lib/qubdi/resync';
import {
    getSyncState,
    needsPassword,
    setSyncState,
    toConnectionRef,
} from '@/lib/qubdi/sync-state';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import type { ChangeSet } from '../../../shared/reconcile';

export interface ResyncDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ResyncDialog: React.FC<ResyncDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const { currentDiagram, updateDiagramData } = useDiagram();
    const { addUndoAction, resetRedoStack } = useRedoUndoStack();
    const { syncDiagram, remoteIdFor } = useQubdi();
    const { toast } = useToast();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [plan, setPlan] = useState<{
        cs: ChangeSet;
        metadata: DatabaseMetadata;
    } | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const state = open ? getSyncState(currentDiagram.id) : undefined;

    useEffect(() => {
        if (open) {
            setPlan(null);
            setError(null);
            setPassword('');
        }
    }, [open]);

    const groups = useMemo(
        () => (plan ? groupChanges(plan.cs.changes) : []),
        [plan]
    );

    const check = async () => {
        if (!state) return;
        const ref = toConnectionRef(state, password || undefined);
        if (!ref) {
            setError('Enter the database password to continue.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await api.introspect({
                ...ref,
                schemas: state.schemas,
                tables: state.tables,
            });
            const metadata = res.metadata as DatabaseMetadata;
            const cs = planResync(currentDiagram, metadata, state.sourceKeys);
            setPlan({ cs, metadata });
            // changes start checked; renames are only a suggestion
            setSelected(new Set(cs.changes.map((c) => c.id)));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const toggle = (id: string) =>
        setSelected((cur) => {
            const next = new Set(cur);
            if (!next.delete(id)) next.add(id);
            return next;
        });

    const apply = async () => {
        if (!plan || !state) return;
        setBusy(true);
        setError(null);
        try {
            const previous = structuredClone(currentDiagram);
            const next = await applyResync(
                currentDiagram,
                plan.metadata,
                state.dialect,
                plan.cs,
                selected
            );
            // one undo step for the whole re-sync
            await updateDiagramData(next, { resetHistory: false });
            addUndoAction({
                action: 'updateDiagramData',
                redoData: { diagram: next },
                undoData: { diagram: previous },
            });
            resetRedoStack();
            setSyncState(currentDiagram.id, {
                ...state,
                sourceKeys: snapshotSourceKeys(
                    next,
                    plan.metadata,
                    state.sourceKeys
                ),
                lastSyncedAt: new Date().toISOString(),
            });
            // keep the server copy in step so drift checks compare the new state
            if (remoteIdFor(currentDiagram.id)) {
                await syncDiagram(next).catch(() => undefined);
            }
            toast({ title: `Applied ${selected.size} change(s)` });
            onOpenChange(false);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl" showClose>
                <DialogHeader>
                    <DialogTitle>Re-sync from database</DialogTitle>
                    <DialogDescription>
                        Pull changes from the live database. Layout, colours,
                        areas, notes and descriptions are kept.
                    </DialogDescription>
                </DialogHeader>

                {!state ? (
                    <p className="text-sm text-muted-foreground">
                        This diagram was not imported from a database in this
                        browser, so there is no source to re-sync from. Use
                        Import from database to create one.
                    </p>
                ) : !plan ? (
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void check();
                        }}
                    >
                        <p className="text-sm text-muted-foreground">
                            Last synced{' '}
                            {new Date(state.lastSyncedAt).toLocaleString()}.
                        </p>
                        {needsPassword(state) ||
                        state.source.kind === 'inline' ? (
                            <Input
                                type="password"
                                aria-label="Database password"
                                placeholder="Database password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        ) : null}
                        {error ? (
                            <p role="alert" className="text-sm text-red-500">
                                {error}
                            </p>
                        ) : null}
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Checking…' : 'Check for changes'}
                        </Button>
                    </form>
                ) : plan.cs.changes.length === 0 &&
                  plan.cs.possibleRenames.length === 0 ? (
                    <p className="text-sm" data-testid="resync-clean">
                        No changes. The diagram matches the database.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div
                            className="flex max-h-80 flex-col gap-3 overflow-y-auto"
                            data-testid="resync-changes"
                        >
                            {plan.cs.possibleRenames.length > 0 ? (
                                <fieldset className="rounded-md border p-2">
                                    <legend className="px-1 text-sm font-medium">
                                        Possible renames
                                    </legend>
                                    <ul className="flex flex-col gap-1 text-sm">
                                        {plan.cs.possibleRenames.map((r) => (
                                            <li key={r.id}>
                                                <label className="flex items-start gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(
                                                            r.id
                                                        )}
                                                        onChange={() =>
                                                            toggle(r.id)
                                                        }
                                                    />
                                                    <span>
                                                        {describeRename(r)}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </fieldset>
                            ) : null}
                            {groups.map((g) => (
                                <fieldset
                                    key={g.group}
                                    className="rounded-md border p-2"
                                >
                                    <legend className="px-1 text-sm font-medium">
                                        {g.group}
                                    </legend>
                                    <ul className="flex flex-col gap-1 text-sm">
                                        {g.changes.map((c) => (
                                            <li key={c.id}>
                                                <label className="flex items-start gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(
                                                            c.id
                                                        )}
                                                        onChange={() =>
                                                            toggle(c.id)
                                                        }
                                                    />
                                                    <span>
                                                        {describeChange(c)}
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </fieldset>
                            ))}
                        </div>
                        {error ? (
                            <p role="alert" className="text-sm text-red-500">
                                {error}
                            </p>
                        ) : null}
                        <div className="flex justify-between">
                            <Button
                                variant="ghost"
                                onClick={() => setPlan(null)}
                            >
                                Back
                            </Button>
                            <Button
                                disabled={busy || selected.size === 0}
                                onClick={() => void apply()}
                            >
                                {busy
                                    ? 'Applying…'
                                    : `Apply ${selected.size} selected`}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
