import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/components/input/input';
import { useStorage } from '@/hooks/use-storage';
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
import { setSyncState } from '@/lib/qubdi/sync-state';
import { snapshotSourceKeys } from '@/lib/qubdi/resync';
import {
    allTableKeys,
    metadataToDiagram,
    schemasOfSelection,
    summarizeSelection,
    tableKey,
} from '@/lib/qubdi/import-from-db';

export interface ImportFromDatabaseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The new diagram, and the connections used, belong to this project. */
    projectId: string;
    projectSlug: string;
}

type Step = 'connect' | 'select' | 'preview';

const DEFAULT_PORT: Record<DbDialect, string> = {
    postgresql: '5432',
    sqlserver: '1433',
};

const emptyForm = {
    dialect: 'postgresql' as DbDialect,
    host: '',
    port: DEFAULT_PORT.postgresql,
    database: '',
    user: '',
    password: '',
    ssl: false,
    trustServerCertificate: false,
    saveAs: '',
};

export const ImportFromDatabaseDialog: React.FC<
    ImportFromDatabaseDialogProps
> = ({ open, onOpenChange, projectId, projectSlug }) => {
    const { addDiagram } = useStorage();
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

    useEffect(() => {
        if (!open) return;
        setStep('connect');
        setError(null);
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
            // nothing lives outside a project: create it on the server right away
            const remoteId = await syncDiagram(diagram, projectId);
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
                tables: [...selected],
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
                    <DialogTitle>Import from database</DialogTitle>
                    <DialogDescription>
                        {step === 'connect' &&
                            'Connect read-only to read the schema. Credentials are used for this request only unless you save the connection.'}
                        {step === 'select' &&
                            'Choose the schemas and tables to import.'}
                        {step === 'preview' && 'Review what will be created.'}
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
                                aria-label="Saved connection"
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
                                    { value: '', label: 'New connection' },
                                    ...saved.map((s) => ({
                                        value: s.id,
                                        label: s.name,
                                    })),
                                ]}
                            />
                        ) : null}
                        <div className="flex gap-2">
                            <OptionSelect
                                aria-label="Database type"
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
                                placeholder="Host"
                                aria-label="Host"
                                value={form.host}
                                disabled={!!savedId}
                                onChange={(e) => set('host', e.target.value)}
                                required
                            />
                            <Input
                                className="w-24"
                                placeholder="Port"
                                aria-label="Port"
                                inputMode="numeric"
                                value={form.port}
                                disabled={!!savedId}
                                onChange={(e) => set('port', e.target.value)}
                            />
                        </div>
                        <Input
                            placeholder="Database"
                            aria-label="Database"
                            value={form.database}
                            disabled={!!savedId}
                            onChange={(e) => set('database', e.target.value)}
                            required
                        />
                        <Input
                            placeholder="User"
                            aria-label="User"
                            autoComplete="off"
                            value={form.user}
                            disabled={!!savedId}
                            onChange={(e) => set('user', e.target.value)}
                            required
                        />
                        <Input
                            type="password"
                            placeholder={
                                savedId
                                    ? 'Password (leave empty to use the saved one)'
                                    : 'Password'
                            }
                            aria-label="Password"
                            autoComplete="new-password"
                            value={form.password}
                            onChange={(e) => set('password', e.target.value)}
                            required={!savedId}
                        />
                        <div className="flex flex-wrap gap-4 text-sm">
                            <label className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={form.ssl}
                                    disabled={!!savedId}
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
                                    disabled={!!savedId}
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
                        {!savedId ? (
                            <Input
                                placeholder="Save this connection as… (optional)"
                                aria-label="Save connection as"
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
                            {busy ? 'Connecting…' : 'Connect'}
                        </Button>
                    </form>
                ) : null}

                {step === 'select' && catalog ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                            {catalog.schemas.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No tables found in this database.
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
                                            <label className="flex items-center gap-1">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Schema ${s.schema}`}
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
                                                    <label className="flex items-center gap-1">
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
                                                                ? ' (view)'
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
                                Back
                            </Button>
                            <Button
                                disabled={summary.tables + summary.views === 0}
                                onClick={() => setStep('preview')}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}

                {step === 'preview' && catalog ? (
                    <div className="flex flex-col gap-3">
                        <Input
                            aria-label="Diagram name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <p className="text-sm" data-testid="db-import-summary">
                            {summary.tables} table
                            {summary.tables === 1 ? '' : 's'}
                            {summary.views > 0
                                ? ` and ${summary.views} view${summary.views === 1 ? '' : 's'}`
                                : ''}{' '}
                            from {summary.schemas.length} schema
                            {summary.schemas.length === 1 ? '' : 's'} (
                            {summary.schemas.join(', ')}). Relationships between
                            the selected tables are imported too.
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
                                Back
                            </Button>
                            <Button
                                disabled={busy}
                                onClick={() => void create()}
                            >
                                {busy ? 'Creating…' : 'Create diagram'}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
