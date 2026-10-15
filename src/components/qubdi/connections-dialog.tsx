import React, { useCallback, useEffect, useState } from 'react';
import { Database, Pencil, Plus, Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/alert-dialog/alert-dialog';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import { OptionSelect } from '@/components/option-select/option-select';
import {
    api,
    errorMessage,
    type DbDialect,
    type SavedConnection,
} from '@/lib/qubdi/api';
import {
    DEFAULT_PORT,
    describeConnection,
    emptyConnectionForm,
    formFromConnection,
    formToConnection,
    type ConnectionForm,
} from '@/lib/qubdi/connection-form';

export interface ConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: { id: string; name: string };
    /** Called after a connection was added, changed or deleted. */
    onChanged?: () => void;
}

/** null: the list; 'new': an empty form; a connection: editing that one */
type Editing = null | 'new' | SavedConnection;

/**
 * The database connections of a project: where its editors import from,
 * re-sync from and check drift against. Passwords are stored encrypted by the
 * server and never come back, so editing leaves them alone unless a new one
 * is typed.
 */
export const ConnectionsDialog: React.FC<ConnectionsDialogProps> = ({
    open,
    onOpenChange,
    project,
    onChanged,
}) => {
    const [connections, setConnections] = useState<SavedConnection[] | null>(
        null
    );
    // false when the server has no CONNECTION_KEY: nothing could be saved
    const [canStore, setCanStore] = useState<boolean | null>(null);
    const [editing, setEditing] = useState<Editing>(null);
    const [form, setForm] = useState<ConnectionForm>(emptyConnectionForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tested, setTested] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<SavedConnection | null>(
        null
    );

    const load = useCallback(async () => {
        try {
            setConnections(await api.listSavedConnections(project.id));
            setError(null);
        } catch (e) {
            setConnections([]);
            setError(errorMessage(e));
        }
    }, [project.id]);

    useEffect(() => {
        if (!open) return;
        setConnections(null);
        setEditing(null);
        setError(null);
        setTested(null);
        void load();
        api.introspectCapabilities()
            .then((c) => setCanStore(c.savedConnections))
            // an older server cannot say; let the attempt report any problem
            .catch(() => setCanStore(true));
    }, [open, load]);

    const set = <K extends keyof ConnectionForm>(
        key: K,
        value: ConnectionForm[K]
    ) => {
        setForm((f) => ({ ...f, [key]: value }));
        setTested(null);
    };

    const startEditing = (target: Editing) => {
        setEditing(target);
        setForm(
            target && target !== 'new'
                ? formFromConnection(target)
                : emptyConnectionForm()
        );
        setError(null);
        setTested(null);
    };

    const changed = async () => {
        await load();
        onChanged?.();
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        setBusy(true);
        setError(null);
        try {
            const { password, ...fields } = formToConnection(form);
            if (editing === 'new') {
                await api.saveConnection({
                    ...fields,
                    password,
                    name: form.name.trim(),
                    projectId: project.id,
                });
            } else {
                await api.updateConnection(editing.id, {
                    ...fields,
                    name: form.name.trim(),
                    // empty: keep the saved password
                    ...(password ? { password } : {}),
                });
            }
            setEditing(null);
            await changed();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        setBusy(true);
        setError(null);
        setTested(null);
        try {
            const res = await api.introspectCatalog({
                connection: formToConnection(form),
            });
            const n = res.schemas.length;
            setTested(
                `Connected to ${res.database}. Found ${n} schema${n === 1 ? '' : 's'}.`
            );
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!confirmDelete) return;
        setBusy(true);
        setError(null);
        try {
            await api.deleteSavedConnection(confirmDelete.id);
            await changed();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
            setConfirmDelete(null);
        }
    };

    const isNew = editing === 'new';
    // only a password needs the server's key; the rest of an edit is plain settings
    const needsKey = isNew || !!form.password;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg" showClose>
                    <DialogHeader>
                        <DialogTitle>
                            {editing === null
                                ? 'Database connections'
                                : isNew
                                  ? 'New connection'
                                  : 'Edit connection'}
                        </DialogTitle>
                        <DialogDescription>
                            {editing === null
                                ? `Saved for ${project.name}. Its editors use them to import, re-sync and check drift. Passwords are stored encrypted and are never shown again.`
                                : 'Connects read-only to read the schema.'}
                        </DialogDescription>
                    </DialogHeader>

                    {canStore === false ? (
                        <p
                            role="alert"
                            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
                        >
                            This server cannot store passwords yet, so no
                            connection can be saved. Whoever runs it needs to
                            set <code>CONNECTION_KEY</code> (at least 16
                            characters) and restart it.
                        </p>
                    ) : null}

                    {editing === null ? (
                        <div className="flex flex-col gap-3">
                            {connections === null ? (
                                <p className="text-sm text-muted-foreground">
                                    Loading…
                                </p>
                            ) : connections.length === 0 ? (
                                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    <Database className="mx-auto mb-2 size-6" />
                                    No connections yet.
                                </p>
                            ) : (
                                <ul
                                    aria-label="Connections"
                                    className="flex max-h-72 flex-col gap-2 overflow-y-auto"
                                >
                                    {connections.map((c) => (
                                        <li
                                            key={c.id}
                                            className="flex items-center justify-between gap-2 rounded-md border p-2"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium">
                                                    {c.name}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {describeConnection(c)}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    aria-label={`Edit ${c.name}`}
                                                    onClick={() =>
                                                        startEditing(c)
                                                    }
                                                >
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    aria-label={`Delete ${c.name}`}
                                                    onClick={() =>
                                                        setConfirmDelete(c)
                                                    }
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {error ? (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {error}
                                </p>
                            ) : null}
                            <Button
                                className="gap-1 self-start"
                                disabled={canStore === false}
                                onClick={() => startEditing('new')}
                            >
                                <Plus />
                                Add connection
                            </Button>
                        </div>
                    ) : (
                        <form
                            onSubmit={save}
                            className="flex flex-col gap-3"
                            data-testid="connection-form"
                        >
                            <Input
                                placeholder="Name, e.g. Production replica"
                                aria-label="Name"
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                maxLength={100}
                                required
                            />
                            <div className="flex gap-2">
                                <OptionSelect
                                    aria-label="Database type"
                                    className="w-40 shrink-0"
                                    value={form.dialect}
                                    onValueChange={(v) => {
                                        const dialect = v as DbDialect;
                                        setForm((f) => ({
                                            ...f,
                                            dialect,
                                            // keep a port the user chose
                                            port:
                                                f.port ===
                                                DEFAULT_PORT[f.dialect]
                                                    ? DEFAULT_PORT[dialect]
                                                    : f.port,
                                        }));
                                        setTested(null);
                                    }}
                                    options={[
                                        {
                                            value: 'postgresql',
                                            label: 'PostgreSQL',
                                        },
                                        {
                                            value: 'sqlserver',
                                            label: 'SQL Server',
                                        },
                                    ]}
                                />
                                <Input
                                    placeholder="Host"
                                    aria-label="Host"
                                    value={form.host}
                                    onChange={(e) =>
                                        set('host', e.target.value)
                                    }
                                    required
                                />
                                <Input
                                    className="w-24"
                                    placeholder="Port"
                                    aria-label="Port"
                                    inputMode="numeric"
                                    value={form.port}
                                    onChange={(e) =>
                                        set('port', e.target.value)
                                    }
                                />
                            </div>
                            <Input
                                placeholder="Database"
                                aria-label="Database"
                                value={form.database}
                                onChange={(e) =>
                                    set('database', e.target.value)
                                }
                                required
                            />
                            <Input
                                placeholder="User"
                                aria-label="User"
                                autoComplete="off"
                                value={form.user}
                                onChange={(e) => set('user', e.target.value)}
                                required
                            />
                            <Input
                                type="password"
                                placeholder={
                                    isNew
                                        ? 'Password'
                                        : 'Password (leave empty to keep the saved one)'
                                }
                                aria-label="Password"
                                autoComplete="new-password"
                                value={form.password}
                                onChange={(e) =>
                                    set('password', e.target.value)
                                }
                                required={isNew}
                            />
                            <div className="flex flex-wrap gap-4 text-sm">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={form.ssl}
                                        onChange={(e) =>
                                            set('ssl', e.target.checked)
                                        }
                                    />
                                    Use SSL / TLS
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={form.trustServerCertificate}
                                        onChange={(e) =>
                                            set(
                                                'trustServerCertificate',
                                                e.target.checked
                                            )
                                        }
                                    />
                                    Trust server certificate
                                </label>
                            </div>
                            {tested ? (
                                <p role="status" className="text-sm">
                                    {tested}
                                </p>
                            ) : null}
                            {error ? (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {error}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy || !form.password}
                                    title={
                                        form.password
                                            ? undefined
                                            : 'Type the password to test the connection'
                                    }
                                    onClick={() => void test()}
                                >
                                    Test connection
                                </Button>
                                <span className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => startEditing(null)}
                                    >
                                        Back
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            busy ||
                                            (canStore === false && needsKey)
                                        }
                                    >
                                        {busy ? 'Working…' : 'Save'}
                                    </Button>
                                </span>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirmDelete !== null}
                onOpenChange={(next) =>
                    !next && !busy && setConfirmDelete(null)
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete this connection?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {`"${confirmDelete?.name ?? ''}" is removed for everyone in ${project.name}. Anything that uses it, such as a drift check, needs another connection.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                e.preventDefault();
                                void remove();
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
