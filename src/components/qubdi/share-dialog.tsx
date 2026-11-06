import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { ShareLinkList } from './share-link-list';
import {
    api,
    errorMessage,
    type RemoteShareLink,
    type ShareAccess,
} from '@/lib/qubdi/api';
import { buildShareUrl } from '@/lib/qubdi/viewer-model';

export interface ShareDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Resolves the server diagram id, uploading the diagram first if needed. */
    ensureRemoteId: () => Promise<string>;
}

// same look as the dropdown next to it
const DATE_INPUT_CLASS =
    'h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/30';

// a function, so the labels follow the language at render time
const accessOptions = (t: TFunction) => [
    { value: 'anyone', label: t('qubdi.workspace.share.accessAnyone') },
    { value: 'signed_in', label: t('qubdi.workspace.share.accessSignedIn') },
    { value: 'off', label: t('qubdi.workspace.share.accessOff') },
];

/**
 * datetime-local value <-> ISO string. The field shows and reads the viewer's
 * local time, so the value is built from local date parts: the ISO text is UTC.
 */
const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => {
    if (!v) return null;
    const d = new Date(v); // no zone in the text: read as local time
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const ShareDialog: React.FC<ShareDialogProps> = ({
    open,
    onOpenChange,
    ensureRemoteId,
}) => {
    const { t } = useTranslation();
    const [remoteId, setRemoteId] = useState<string | null>(null);
    const [links, setLinks] = useState<RemoteShareLink[] | null>(null);
    // raw tokens exist only right after create/regenerate
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const reload = useCallback(async (id: string) => {
        setLinks(await api.listShareLinks(id));
    }, []);

    // the parent makes a new function each render: only opening starts a load
    const ensureRef = useRef(ensureRemoteId);
    ensureRef.current = ensureRemoteId;

    useEffect(() => {
        if (!open) return;
        setError(null);
        setCopied(null);
        setLinks(null);
        void (async () => {
            try {
                const id = await ensureRef.current();
                setRemoteId(id);
                await reload(id);
            } catch (e) {
                setError(errorMessage(e));
            }
        })();
    }, [open, reload]);

    // "Copied" is a brief confirmation, not a state the button stays in
    useEffect(() => {
        if (copied === null) return;
        const timer = setTimeout(() => setCopied(null), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    // one change at a time: a double click must not make two links
    const working = useRef(false);
    const [busy, setBusy] = useState(false);
    const run = async (fn: (id: string) => Promise<unknown>) => {
        if (!remoteId || working.current) return false;
        working.current = true;
        setBusy(true);
        setError(null);
        try {
            await fn(remoteId);
            await reload(remoteId);
            return true;
        } catch (e) {
            setError(errorMessage(e));
            return false;
        } finally {
            working.current = false;
            setBusy(false);
        }
    };

    const copy = async (linkId: string, url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(linkId);
        } catch {
            setError(t('qubdi.workspace.share.copyFailed'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {t('qubdi.workspace.share.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('qubdi.workspace.share.description')}
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                <ShareLinkList
                    links={links}
                    failed={error !== null}
                    hideRevoked
                    onRevoke={(l) =>
                        run(async (id) => {
                            await api.revokeShareLink(id, l.id);
                            setUrls((u) => {
                                const next = { ...u };
                                delete next[l.id];
                                return next;
                            });
                        })
                    }
                    renderControls={(l) => {
                        const url =
                            urls[l.id] ??
                            (l.token
                                ? buildShareUrl(window.location.origin, l.token)
                                : undefined);
                        return (
                            <>
                                {url ? (
                                    <div className="flex gap-2">
                                        <input
                                            readOnly
                                            aria-label={t(
                                                'qubdi.workspace.share.urlLabel'
                                            )}
                                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2"
                                            value={url}
                                            onFocus={(e) =>
                                                e.currentTarget.select()
                                            }
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => void copy(l.id, url)}
                                        >
                                            {copied === l.id
                                                ? t(
                                                      'qubdi.workspace.share.copied'
                                                  )
                                                : t(
                                                      'qubdi.workspace.share.copy'
                                                  )}
                                        </Button>
                                    </div>
                                ) : (
                                    <span className="text-muted-foreground">
                                        {t('qubdi.workspace.share.urlHidden')}
                                    </span>
                                )}
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-1">
                                        {t('qubdi.workspace.share.access')}
                                        <OptionSelect
                                            size="sm"
                                            className="w-44"
                                            aria-label={t(
                                                'qubdi.workspace.share.accessAria'
                                            )}
                                            value={l.access}
                                            onValueChange={(v) =>
                                                void run((id) =>
                                                    api.updateShareLink(
                                                        id,
                                                        l.id,
                                                        {
                                                            access: v as ShareAccess,
                                                        }
                                                    )
                                                )
                                            }
                                            options={accessOptions(t)}
                                        />
                                    </label>
                                    <label className="flex items-center gap-1">
                                        {t('qubdi.workspace.share.expires')}
                                        {/* saved when the field is left, not on every
                                            keystroke of a half typed date */}
                                        <input
                                            type="datetime-local"
                                            className={DATE_INPUT_CLASS}
                                            key={`${l.id}:${l.expiresAt ?? ''}`}
                                            defaultValue={toLocalInput(
                                                l.expiresAt
                                            )}
                                            onBlur={(e) => {
                                                const typed = e.target.value;
                                                if (
                                                    typed ===
                                                    toLocalInput(l.expiresAt)
                                                )
                                                    return;
                                                void run((id) =>
                                                    api.updateShareLink(
                                                        id,
                                                        l.id,
                                                        {
                                                            expiresAt:
                                                                fromLocalInput(
                                                                    typed
                                                                ),
                                                        }
                                                    )
                                                );
                                            }}
                                        />
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={l.live}
                                            onChange={(e) =>
                                                void run((id) =>
                                                    api.updateShareLink(
                                                        id,
                                                        l.id,
                                                        {
                                                            live: e.target
                                                                .checked,
                                                        }
                                                    )
                                                )
                                            }
                                        />
                                        {t('qubdi.workspace.share.live')}
                                    </label>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            void run(async (id) => {
                                                const r =
                                                    await api.regenerateShareLink(
                                                        id,
                                                        l.id
                                                    );
                                                setUrls((u) => ({
                                                    ...u,
                                                    [l.id]: buildShareUrl(
                                                        window.location.origin,
                                                        r.token
                                                    ),
                                                }));
                                            })
                                        }
                                    >
                                        {t('qubdi.workspace.share.regenerate')}
                                    </Button>
                                </div>
                            </>
                        );
                    }}
                />

                <Button
                    disabled={!remoteId || busy}
                    onClick={() =>
                        void run(async (id) => {
                            const r = await api.createShareLink(id, {});
                            setUrls((u) => ({
                                ...u,
                                [r.id]: buildShareUrl(
                                    window.location.origin,
                                    r.token
                                ),
                            }));
                        })
                    }
                >
                    {t('qubdi.workspace.share.create')}
                </Button>
            </DialogContent>
        </Dialog>
    );
};
