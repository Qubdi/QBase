import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Pencil, Plus, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/platform/ui/alert-dialog';
import { Button } from '@/platform/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Input } from '@/platform/ui/input';
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
    const { t } = useTranslation();
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

    // only the newest load may set state: a slow reply for an earlier opening
    // or another project must not show here
    const newestLoad = useRef(0);
    const cancelLoad = useCallback(() => {
        newestLoad.current += 1;
    }, []);
    const load = useCallback(() => {
        const request = ++newestLoad.current;
        return api.listSavedConnections(project.id).then(
            (list) => {
                if (request !== newestLoad.current) return;
                setConnections(list);
                setError(null);
            },
            (e: unknown) => {
                if (request !== newestLoad.current) return;
                setConnections([]);
                setError(errorMessage(e));
            }
        );
    }, [project.id]);

    // each opening, and each other project while open, starts from a clean
    // dialog: reset while rendering, before the effect below starts the load
    const [openFor, setOpenFor] = useState<string | null>(null);
    const wantedFor = open ? project.id : null;
    if (openFor !== wantedFor) {
        setOpenFor(wantedFor);
        if (wantedFor !== null) {
            setConnections(null);
            setEditing(null);
            setError(null);
            setTested(null);
        }
    }

    useEffect(() => {
        if (!open) return;
        void load();
        api.introspectCapabilities()
            .then((c) => setCanStore(c.savedConnections))
            // an older server cannot say; let the attempt report any problem
            .catch(() => setCanStore(true));
        return cancelLoad;
    }, [open, load, cancelLoad]);

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
                t('qubdi.database.connections.tested', {
                    database: res.database,
                    count: n,
                })
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
    // sending the saved password to another host, port or dialect needs it typed again
    const target = formToConnection(form);
    const movesTarget =
        !!editing &&
        editing !== 'new' &&
        (target.host.trim().toLowerCase() !== editing.host.toLowerCase() ||
            target.dialect !== editing.dialect ||
            (target.port !== undefined && target.port !== editing.port));

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg" showClose>
                    <DialogHeader>
                        <DialogTitle>
                            {editing === null
                                ? t('qubdi.database.connections.title')
                                : isNew
                                  ? t('qubdi.database.connections.titleNew')
                                  : t('qubdi.database.connections.titleEdit')}
                        </DialogTitle>
                        <DialogDescription>
                            {editing === null
                                ? t(
                                      'qubdi.database.connections.descriptionList',
                                      {
                                          project: project.name,
                                      }
                                  )
                                : t(
                                      'qubdi.database.connections.descriptionForm'
                                  )}
                        </DialogDescription>
                    </DialogHeader>

                    {canStore === false ? (
                        <p
                            role="alert"
                            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
                        >
                            <Trans
                                i18nKey="qubdi.database.connections.noStore"
                                components={{ code: <code /> }}
                            />
                        </p>
                    ) : null}

                    {editing === null ? (
                        <div className="flex flex-col gap-3">
                            {connections === null ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('qubdi.database.connections.loading')}
                                </p>
                            ) : connections.length === 0 ? (
                                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    <Database className="mx-auto mb-2 size-6" />
                                    {t('qubdi.database.connections.empty')}
                                </p>
                            ) : (
                                <ul
                                    aria-label={t(
                                        'qubdi.database.connections.listLabel'
                                    )}
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
                                                    aria-label={t(
                                                        'qubdi.database.connections.editAria',
                                                        { name: c.name }
                                                    )}
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
                                                    aria-label={t(
                                                        'qubdi.database.connections.deleteAria',
                                                        { name: c.name }
                                                    )}
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
                                {t('qubdi.database.connections.add')}
                            </Button>
                        </div>
                    ) : (
                        <form
                            onSubmit={save}
                            className="flex flex-col gap-3"
                            data-testid="connection-form"
                        >
                            <Input
                                placeholder={t(
                                    'qubdi.database.connections.namePlaceholder'
                                )}
                                aria-label={t(
                                    'qubdi.database.connections.nameLabel'
                                )}
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                maxLength={100}
                                required
                            />
                            <div className="flex gap-2">
                                <OptionSelect
                                    aria-label={t(
                                        'qubdi.database.connections.dialectLabel'
                                    )}
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
                                    placeholder={t(
                                        'qubdi.database.connections.host'
                                    )}
                                    aria-label={t(
                                        'qubdi.database.connections.host'
                                    )}
                                    value={form.host}
                                    onChange={(e) =>
                                        set('host', e.target.value)
                                    }
                                    required
                                />
                                <Input
                                    className="w-24"
                                    placeholder={t(
                                        'qubdi.database.connections.port'
                                    )}
                                    aria-label={t(
                                        'qubdi.database.connections.port'
                                    )}
                                    inputMode="numeric"
                                    value={form.port}
                                    onChange={(e) =>
                                        set('port', e.target.value)
                                    }
                                />
                            </div>
                            <Input
                                placeholder={t(
                                    'qubdi.database.connections.database'
                                )}
                                aria-label={t(
                                    'qubdi.database.connections.database'
                                )}
                                value={form.database}
                                onChange={(e) =>
                                    set('database', e.target.value)
                                }
                                required
                            />
                            <Input
                                placeholder={t(
                                    'qubdi.database.connections.user'
                                )}
                                aria-label={t(
                                    'qubdi.database.connections.user'
                                )}
                                autoComplete="off"
                                value={form.user}
                                onChange={(e) => set('user', e.target.value)}
                                required
                            />
                            <Input
                                type="password"
                                placeholder={
                                    isNew
                                        ? t(
                                              'qubdi.database.connections.password'
                                          )
                                        : movesTarget
                                          ? t(
                                                'qubdi.database.connections.passwordMoves'
                                            )
                                          : t(
                                                'qubdi.database.connections.passwordKeep'
                                            )
                                }
                                aria-label={t(
                                    'qubdi.database.connections.password'
                                )}
                                autoComplete="new-password"
                                value={form.password}
                                onChange={(e) =>
                                    set('password', e.target.value)
                                }
                                required={isNew || movesTarget}
                            />
                            <div className="flex flex-wrap gap-4 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={form.ssl}
                                        onChange={(e) =>
                                            set('ssl', e.target.checked)
                                        }
                                    />
                                    {t('qubdi.database.connections.ssl')}
                                </label>
                                <label className="flex items-center gap-2">
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
                                    {t(
                                        'qubdi.database.connections.trustCertificate'
                                    )}
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
                                            : t(
                                                  'qubdi.database.connections.testNeedsPassword'
                                              )
                                    }
                                    onClick={() => void test()}
                                >
                                    {t('qubdi.database.connections.test')}
                                </Button>
                                <span className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => startEditing(null)}
                                    >
                                        {t('qubdi.database.connections.back')}
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            busy ||
                                            (canStore === false && needsKey)
                                        }
                                    >
                                        {busy
                                            ? t(
                                                  'qubdi.database.connections.working'
                                              )
                                            : t(
                                                  'qubdi.database.connections.save'
                                              )}
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
                            {t('qubdi.database.connections.deleteTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('qubdi.database.connections.deleteBody', {
                                name: confirmDelete?.name ?? '',
                                project: project.name,
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            {t('qubdi.database.connections.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                e.preventDefault();
                                void remove();
                            }}
                        >
                            {t('qubdi.database.connections.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};
