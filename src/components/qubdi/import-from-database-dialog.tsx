import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { Button } from '@/platform/ui/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/platform/ui/input';
import { useStorage } from '@/qbase/use-storage';
import { useQubdi } from '@/hooks/use-qubdi';
import { projectDiagramPath } from '@/lib/qubdi/project-path';
import type { DatabaseMetadata } from '@/lib/data/import-metadata/metadata-types/database-metadata';
import {
    api,
    errorMessage,
    type CatalogResponse,
    type DbConnectionInput,
    type DbDialect,
    type SavedConnection,
} from '@/lib/qubdi/api';
import { DEFAULT_PORT } from '@/lib/qubdi/connection-form';
import { setSyncState } from '@/lib/qubdi/sync-state';
import { snapshotSourceKeys } from '@/lib/qubdi/resync';
import {
    allTableKeys,
    metadataToDiagram,
    schemasOfSelection,
    summarizeSelection,
    tableKey,
} from '@/lib/qubdi/import-from-db';
import { PasswordInput } from './password-input';

export interface ImportFromDatabaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The new diagram, and the connections used, belong to this project. */
    projectId: string;
    projectSlug: string;
}

type Step = 'connect' | 'select' | 'preview';

const emptyForm = {
    dialect: 'postgresql' as DbDialect,
    host: '',
    port: DEFAULT_PORT.postgresql,
    database: '',
    user: '',
    password: '',
    // encrypted unless the user turns it off
    ssl: true,
    trustServerCertificate: false,
    saveAs: '',
};

export const ImportFromDatabaseDialog: React.FC<
    ImportFromDatabaseDialogProps
> = ({ open, onOpenChange, projectId, projectSlug }) => {
    const { t } = useTranslation();
    const { addDiagram, deleteDiagram } = useStorage();
    const { syncDiagram } = useQubdi();
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>('connect');
    const [form, setForm] = useState(emptyForm);
    const [saved, setSaved] = useState<SavedConnection[]>([]);
    const [savedId, setSavedId] = useState('');
    // id of the connection saved during this wizard run, if any
    const [justSavedId, setJustSavedId] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // a fresh run each time: nothing typed or picked last time carries over.
    // Reset while rendering, when the dialog opens or the project changes.
    const [runFor, setRunFor] = useState<string | null>(null);
    const wantedRun = open ? projectId : null;
    if (runFor !== wantedRun) {
        setRunFor(wantedRun);
        if (wantedRun !== null) {
            setStep('connect');
            setError(null);
            setForm(emptyForm);
            setSavedId('');
            setJustSavedId(null);
            setCatalog(null);
            setSelected(new Set());
            setName('');
        }
    }

    useEffect(() => {
        if (!open) return;
        api.listSavedConnections(projectId)
            .then(setSaved)
            .catch(() => setSaved([]));
    }, [open, projectId]);

    const set = <K extends keyof typeof emptyForm>(
        key: K,
        value: (typeof emptyForm)[K]
    ) => setForm((f) => ({ ...f, [key]: value }));

    const connection: DbConnectionInput = {
        dialect: form.dialect,
        host: form.host.trim(),
        port: Number(form.port) || undefined,
        database: form.database.trim(),
        user: form.user.trim(),
        password: form.password,
        ssl: form.ssl,
        trustServerCertificate: form.trustServerCertificate,
    };

    /** A saved connection is used as-is unless the user typed a password. */
    const ref = () =>
        savedId
            ? {
                  savedConnectionId: savedId,
                  ...(form.password ? { password: form.password } : {}),
              }
            : { connection };

    const connect = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await api.introspectCatalog(ref());
            if (!savedId && form.saveAs.trim()) {
                const s = await api.saveConnection({
                    ...connection,
                    name: form.saveAs.trim(),
                    projectId,
                });
                setSaved((list) => [...list, s]);
                setJustSavedId(s.id);
            }
            setCatalog(res);
            setSelected(new Set(allTableKeys(res.schemas)));
            setName(res.database);
            setStep('select');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const summary = useMemo(
        () =>
            catalog
                ? summarizeSelection(catalog.schemas, selected)
                : { schemas: [], tables: 0, views: 0 },
        [catalog, selected]
    );

    const create = async () => {
        if (!catalog) return;
        setBusy(true);
        setError(null);
        // set while the copy exists only in this browser, so a failed server create can take it back
        let localId: string | null = null;
        try {
            const res = await api.introspect({
                ...ref(),
                schemas: schemasOfSelection(selected),
                tables: [...selected],
            });
            const diagram = await metadataToDiagram(
                res.dialect,
                res.metadata,
                name.trim() || catalog.database
            );
            await addDiagram({ diagram });
            localId = diagram.id;
            // nothing lives outside a project: create it on the server right away
            const remoteId = await syncDiagram(diagram, projectId);
            localId = null; // the server has it now: nothing to take back
            // remember where this diagram came from so re-sync is one click;
            // passwords are never stored in the browser
            const usedSaved = savedId || justSavedId;
            const { password: _password, ...withoutPassword } = connection;
            void _password;
            setSyncState(diagram.id, {
                dialect: res.dialect,
                source: usedSaved
                    ? { kind: 'saved', savedConnectionId: usedSaved }
                    : { kind: 'inline', connection: withoutPassword },
                // every table chosen: remember "all", so a table added to the
                // database later shows up in re-sync and drift checks
                tables:
                    selected.size === allTableKeys(catalog.schemas).length
                        ? []
                        : [...selected],
                schemas: schemasOfSelection(selected),
                sourceKeys: snapshotSourceKeys(
                    diagram,
                    res.metadata as DatabaseMetadata
                ),
                lastSyncedAt: new Date().toISOString(),
            });
            onOpenChange(false);
            navigate(projectDiagramPath(projectSlug, remoteId));
        } catch (err) {
            // the diagram exists only in this browser and the server never got it:
            // a retry would make a second copy, and the first would be orphaned
            if (localId) await deleteDiagram(localId).catch(() => undefined);
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const toggle = (key: string) =>
        setSelected((cur) => {
            const next = new Set(cur);
            if (!next.delete(key)) next.add(key);
            return next;
        });

    const toggleSchema = (keys: string[]) =>
        setSelected((cur) => {
            const next = new Set(cur);
            const allOn = keys.every((k) => next.has(k));
            keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
            return next;
        });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {t('qubdi.database.importFromDb.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'connect' &&
                            t('qubdi.database.importFromDb.descriptionConnect')}
                        {step === 'select' &&
                            t('qubdi.database.importFromDb.descriptionSelect')}
                        {step === 'preview' &&
                            t('qubdi.database.importFromDb.descriptionPreview')}
                    </DialogDescription>
                </DialogHeader>

                {step === 'connect' ? (
                    <form
                        onSubmit={connect}
                        className="flex flex-col gap-3"
                        data-testid="db-connect-form"
                    >
                        {saved.length > 0 ? (
                            <OptionSelect
                                aria-label={t(
                                    'qubdi.database.importFromDb.savedConnection'
                                )}
                                value={savedId}
                                onValueChange={(id) => {
                                    setSavedId(id);
                                    const s = saved.find((x) => x.id === id);
                                    if (s) {
                                        setForm({
                                            ...emptyForm,
                                            dialect: s.dialect,
                                            host: s.host,
                                            port: String(s.port),
                                            database: s.database,
                                            user: s.user,
                                            ssl: s.ssl,
                                            trustServerCertificate:
                                                s.trustServerCertificate,
                                        });
                                    }
                                }}
                                options={[
                                    {
                                        value: '',
                                        label: t(
                                            'qubdi.database.importFromDb.newConnection'
                                        ),
                                    },
                                    ...saved.map((s) => ({
                                        value: s.id,
                                        label: s.name,
                                    })),
                                ]}
                            />
                        ) : null}
                        <div className="flex gap-2">
                            <OptionSelect
                                aria-label={t(
                                    'qubdi.database.importFromDb.dialectLabel'
                                )}
                                className="w-40 shrink-0"
                                value={form.dialect}
                                disabled={!!savedId}
                                onValueChange={(v) => {
                                    const d = v as DbDialect;
                                    setForm((f) => ({
                                        ...f,
                                        dialect: d,
                                        port: DEFAULT_PORT[d],
                                    }));
                                }}
                                options={[
                                    {
                                        value: 'postgresql',
                                        label: 'PostgreSQL',
                                    },
                                    { value: 'sqlserver', label: 'SQL Server' },
                                ]}
                            />
                            <Input
                                placeholder={t(
                                    'qubdi.database.importFromDb.host'
                                )}
                                aria-label={t(
                                    'qubdi.database.importFromDb.host'
                                )}
                                value={form.host}
                                disabled={!!savedId}
                                onChange={(e) => set('host', e.target.value)}
                                required
                            />
                            <Input
                                className="w-24"
                                placeholder={t(
                                    'qubdi.database.importFromDb.port'
                                )}
                                aria-label={t(
                                    'qubdi.database.importFromDb.port'
                                )}
                                inputMode="numeric"
                                value={form.port}
                                disabled={!!savedId}
                                onChange={(e) => set('port', e.target.value)}
                            />
                        </div>
                        <Input
                            placeholder={t(
                                'qubdi.database.importFromDb.database'
                            )}
                            aria-label={t(
                                'qubdi.database.importFromDb.database'
                            )}
                            value={form.database}
                            disabled={!!savedId}
                            onChange={(e) => set('database', e.target.value)}
                            required
                        />
                        <Input
                            placeholder={t('qubdi.database.importFromDb.user')}
                            aria-label={t('qubdi.database.importFromDb.user')}
                            autoComplete="off"
                            value={form.user}
                            disabled={!!savedId}
                            onChange={(e) => set('user', e.target.value)}
                            required
                        />
                        <PasswordInput
                            placeholder={
                                savedId
                                    ? t(
                                          'qubdi.database.importFromDb.passwordSaved'
                                      )
                                    : t('qubdi.database.importFromDb.password')
                            }
                            aria-label={t(
                                'qubdi.database.importFromDb.password'
                            )}
                            autoComplete="new-password"
                            value={form.password}
                            onChange={(e) => set('password', e.target.value)}
                            required={!savedId}
                        />
                        <div className="flex flex-wrap gap-4 text-sm">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.ssl}
                                    disabled={!!savedId}
                                    onChange={(e) =>
                                        set('ssl', e.target.checked)
                                    }
                                />
                                {t('qubdi.database.importFromDb.ssl')}
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.trustServerCertificate}
                                    disabled={!!savedId}
                                    onChange={(e) =>
                                        set(
                                            'trustServerCertificate',
                                            e.target.checked
                                        )
                                    }
                                />
                                {t(
                                    'qubdi.database.importFromDb.trustCertificate'
                                )}
                            </label>
                        </div>
                        {!form.ssl && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {t('qubdi.database.importFromDb.sslOff')}
                            </p>
                        )}
                        {!savedId ? (
                            <Input
                                placeholder={t(
                                    'qubdi.database.importFromDb.saveAsPlaceholder'
                                )}
                                aria-label={t(
                                    'qubdi.database.importFromDb.saveAsLabel'
                                )}
                                value={form.saveAs}
                                onChange={(e) => set('saveAs', e.target.value)}
                            />
                        ) : null}
                        {error ? (
                            <p role="alert" className="text-sm text-red-500">
                                {error}
                            </p>
                        ) : null}
                        <Button type="submit" disabled={busy}>
                            {busy
                                ? t('qubdi.database.importFromDb.connecting')
                                : t('qubdi.database.importFromDb.connect')}
                        </Button>
                    </form>
                ) : null}

                {step === 'select' && catalog ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                            {catalog.schemas.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('qubdi.database.importFromDb.noTables')}
                                </p>
                            ) : null}
                            {catalog.schemas.map((s) => {
                                const keys = [
                                    ...s.tables.map((t) =>
                                        tableKey(s.schema, t)
                                    ),
                                    ...s.views.map((v) =>
                                        tableKey(s.schema, v)
                                    ),
                                ];
                                return (
                                    <fieldset
                                        key={s.schema}
                                        className="rounded-md border p-2"
                                    >
                                        <legend className="px-1 text-sm font-medium">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={t(
                                                        'qubdi.database.importFromDb.schemaAria',
                                                        {
                                                            schema: s.schema,
                                                        }
                                                    )}
                                                    checked={keys.every((k) =>
                                                        selected.has(k)
                                                    )}
                                                    onChange={() =>
                                                        toggleSchema(keys)
                                                    }
                                                />
                                                {s.schema}
                                            </label>
                                        </legend>
                                        <ul className="grid grid-cols-2 gap-x-3 text-sm">
                                            {keys.map((k) => (
                                                <li key={k}>
                                                    <label className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.has(
                                                                k
                                                            )}
                                                            onChange={() =>
                                                                toggle(k)
                                                            }
                                                        />
                                                        <span className="truncate">
                                                            {k.slice(
                                                                s.schema
                                                                    .length + 1
                                                            )}
                                                            {s.views.includes(
                                                                k.slice(
                                                                    s.schema
                                                                        .length +
                                                                        1
                                                                )
                                                            )
                                                                ? t(
                                                                      'qubdi.database.importFromDb.viewSuffix'
                                                                  )
                                                                : ''}
                                                        </span>
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>
                                    </fieldset>
                                );
                            })}
                        </div>
                        <div className="flex justify-between">
                            <Button
                                variant="ghost"
                                onClick={() => setStep('connect')}
                            >
                                {t('qubdi.database.importFromDb.back')}
                            </Button>
                            <Button
                                disabled={summary.tables + summary.views === 0}
                                onClick={() => setStep('preview')}
                            >
                                {t('qubdi.database.importFromDb.next')}
                            </Button>
                        </div>
                    </div>
                ) : null}

                {step === 'preview' && catalog ? (
                    <div className="flex flex-col gap-3">
                        <Input
                            aria-label={t(
                                'qubdi.database.importFromDb.diagramName'
                            )}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <p className="text-sm" data-testid="db-import-summary">
                            {t('qubdi.database.importFromDb.summary', {
                                tables: t(
                                    'qubdi.database.importFromDb.tables',
                                    {
                                        count: summary.tables,
                                    }
                                ),
                                views:
                                    summary.views > 0
                                        ? t(
                                              'qubdi.database.importFromDb.views',
                                              {
                                                  count: summary.views,
                                              }
                                          )
                                        : '',
                                schemas: t(
                                    'qubdi.database.importFromDb.schemas',
                                    {
                                        count: summary.schemas.length,
                                    }
                                ),
                                list: summary.schemas.join(', '),
                            })}
                        </p>
                        {error ? (
                            <p role="alert" className="text-sm text-red-500">
                                {error}
                            </p>
                        ) : null}
                        <div className="flex justify-between">
                            <Button
                                variant="ghost"
                                onClick={() => setStep('select')}
                            >
                                {t('qubdi.database.importFromDb.back')}
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => void create()}
                            >
                                {busy
                                    ? t('qubdi.database.importFromDb.creating')
                                    : t('qubdi.database.importFromDb.create')}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
