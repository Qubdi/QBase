import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
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
    'h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm transition-colors hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const ACCESS_OPTIONS = [
    { value: 'anyone', label: 'Anyone with the link' },
    { value: 'signed_in', label: 'Signed-in users' },
    { value: 'off', label: 'Off' },
];

/** datetime-local value <-> ISO string */
const toLocalInput = (iso: string | null) =>
    iso ? new Date(iso).toISOString().slice(0, 16) : '';
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const ShareDialog: React.FC<ShareDialogProps> = ({
    open,
    onOpenChange,
    ensureRemoteId,
}) => {
    const [remoteId, setRemoteId] = useState<string | null>(null);
    const [links, setLinks] = useState<RemoteShareLink[]>([]);
    // raw tokens exist only right after create/regenerate
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const reload = useCallback(async (id: string) => {
        setLinks(await api.listShareLinks(id));
    }, []);

    useEffect(() => {
        if (!open) return;
        setError(null);
        void (async () => {
            try {
                const id = await ensureRemoteId();
                setRemoteId(id);
                await reload(id);
            } catch (e) {
                setError(errorMessage(e));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const run = async (fn: (id: string) => Promise<unknown>) => {
        if (!remoteId) return;
        setError(null);
        try {
            await fn(remoteId);
            await reload(remoteId);
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    const copy = async (linkId: string, url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(linkId);
        } catch {
            setError('Copy failed. Select the link and copy it manually.');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg" showClose>
                <DialogHeader>
                    <DialogTitle>Share</DialogTitle>
                    <DialogDescription>
                        Read-only links show the latest published version.
                        Publish to update what viewers see.
                    </DialogDescription>
                </DialogHeader>

                <ul className="flex flex-col gap-3" aria-label="Share links">
                    {links.map((l) => {
                        const url = urls[l.id];
                        const revoked = l.revokedAt !== null;
                        return (
                            <li
                                key={l.id}
                                className="flex flex-col gap-2 rounded-md border p-3 text-sm"
                            >
                                {revoked ? (
                                    <span className="text-muted-foreground">
                                        Revoked link
                                    </span>
                                ) : (
                                    <>
                                        {url ? (
                                            <div className="flex gap-2">
                                                <input
                                                    readOnly
                                                    aria-label="Share URL"
                                                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2"
                                                    value={url}
                                                    onFocus={(e) =>
                                                        e.currentTarget.select()
                                                    }
                                                />
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        void copy(l.id, url)
                                                    }
                                                >
                                                    {copied === l.id
                                                        ? 'Copied'
                                                        : 'Copy link'}
                                                </Button>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                The URL is only shown when a
                                                link is created or regenerated.
                                            </span>
                                        )}
                                        <div className="flex flex-wrap items-center gap-3">
                                            <label className="flex items-center gap-1">
                                                Access
                                                <OptionSelect
                                                    size="sm"
                                                    className="w-44"
                                                    aria-label="Who can open this link"
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
                                                    options={ACCESS_OPTIONS}
                                                />
                                            </label>
                                            <label className="flex items-center gap-1">
                                                Expires
                                                <input
                                                    type="datetime-local"
                                                    className={DATE_INPUT_CLASS}
                                                    value={toLocalInput(
                                                        l.expiresAt
                                                    )}
                                                    onChange={(e) =>
                                                        void run((id) =>
                                                            api.updateShareLink(
                                                                id,
                                                                l.id,
                                                                {
                                                                    expiresAt:
                                                                        fromLocalInput(
                                                                            e
                                                                                .target
                                                                                .value
                                                                        ),
                                                                }
                                                            )
                                                        )
                                                    }
                                                />
                                            </label>
                                            <label className="flex items-center gap-1">
                                                <input
                                                    type="checkbox"
                                                    checked={l.live}
                                                    onChange={(e) =>
                                                        void run((id) =>
                                                            api.updateShareLink(
                                                                id,
                                                                l.id,
                                                                {
                                                                    live: e
                                                                        .target
                                                                        .checked,
                                                                }
                                                            )
                                                        )
                                                    }
                                                />
                                                Live updates
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
                                                                window.location
                                                                    .origin,
                                                                r.token
                                                            ),
                                                        }));
                                                    })
                                                }
                                            >
                                                Regenerate
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    void run(async (id) => {
                                                        await api.revokeShareLink(
                                                            id,
                                                            l.id
                                                        );
                                                        setUrls((u) => {
                                                            const next = {
                                                                ...u,
                                                            };
                                                            delete next[l.id];
                                                            return next;
                                                        });
                                                    })
                                                }
                                            >
                                                Revoke
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>

                <Button
                    disabled={!remoteId}
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
                    Create link
                </Button>
                {error ? (
                    <p role="alert" className="text-sm text-red-500">
                        {error}
                    </p>
                ) : null}
            </DialogContent>
        </Dialog>
    );
};
