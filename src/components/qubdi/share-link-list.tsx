import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/platform/ui/badge';
import { Button } from '@/platform/ui/button';
import type { ShareLinkStatus } from '@/lib/qubdi/api';
import {
    ACCESS_LABEL,
    canRevoke,
    expiryText,
    linkStatus,
    STATUS_LABEL,
    type ShareLinkFields,
} from '@/lib/qubdi/share-links';
import { ago, exactTime } from '@/lib/qubdi/when';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<
    ShareLinkStatus,
    { variant: 'outline' | 'secondary' | 'destructive'; className?: string }
> = {
    active: {
        variant: 'outline',
        className:
            'border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-400',
    },
    off: { variant: 'secondary' },
    expired: { variant: 'secondary' },
    revoked: { variant: 'destructive' },
};

export interface ShareLinkListProps<L extends ShareLinkFields> {
    /** null while the list is being loaded */
    links: L[] | null;
    /** the load failed; the caller shows why, the list stops saying "Loading…" */
    failed?: boolean;
    /** ends a link; resolves true when it is done (the caller shows any error) */
    onRevoke: (link: L) => Promise<boolean>;
    /** leave ended links out; the admin dialog keeps them as history */
    hideRevoked?: boolean;
    /** more to show under a link that can still be opened, such as its controls */
    renderControls?: (link: L) => React.ReactNode;
}

/**
 * The share-link table, written once. The editor's Share dialog and the admin
 * "Share links" dialog both render it, so their columns, states, wording and
 * revoke action cannot drift apart.
 */
export function ShareLinkList<L extends ShareLinkFields>({
    links,
    failed = false,
    onRevoke,
    hideRevoked = false,
    renderControls,
}: ShareLinkListProps<L>) {
    const { t } = useTranslation();
    // the link waiting for a second click, and the one being ended
    const [confirming, setConfirming] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    if (links === null) {
        return failed ? null : (
            <p className="text-sm text-muted-foreground">
                {t('qubdi.workspace.shareList.loading')}
            </p>
        );
    }
    const shown = hideRevoked
        ? links.filter((l) => linkStatus(l) !== 'revoked')
        : links;
    if (shown.length === 0) {
        return (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t('qubdi.workspace.shareList.empty')}
            </p>
        );
    }

    const revoke = async (link: L) => {
        setBusy(link.id);
        try {
            if (await onRevoke(link)) setConfirming(null);
        } finally {
            setBusy(null);
        }
    };

    return (
        <ul
            aria-label={t('qubdi.workspace.shareList.label')}
            className="flex max-h-96 flex-col gap-2 overflow-y-auto"
        >
            {shown.map((l) => {
                const status = linkStatus(l);
                const badge = STATUS_BADGE[status];
                return (
                    <li
                        key={l.id}
                        className={cn(
                            'flex flex-col gap-2 rounded-md border p-3 text-sm',
                            status === 'revoked' && 'text-muted-foreground'
                        )}
                    >
                        <div
                            data-slot="summary"
                            className="flex flex-wrap items-center gap-2"
                        >
                            <Badge
                                variant={badge.variant}
                                className={badge.className}
                            >
                                {STATUS_LABEL[status]}
                            </Badge>
                            <span className="font-medium">
                                {ACCESS_LABEL[l.access]}
                            </span>
                            {l.live ? (
                                <Badge variant="secondary">
                                    {t('qubdi.workspace.shareList.live')}
                                </Badge>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-end justify-between gap-2">
                            <div className="flex flex-col text-muted-foreground">
                                <span data-slot="maker">
                                    {l.createdByEmail === undefined ? (
                                        t('qubdi.workspace.shareList.made')
                                    ) : l.createdByEmail ? (
                                        <>
                                            {t(
                                                'qubdi.workspace.shareList.madeBy'
                                            )}{' '}
                                            <span className="text-foreground">
                                                {l.createdByEmail}
                                            </span>
                                        </>
                                    ) : (
                                        t(
                                            'qubdi.workspace.shareList.madeByDeleted'
                                        )
                                    )}{' '}
                                    <time
                                        dateTime={l.createdAt}
                                        title={exactTime(l.createdAt)}
                                    >
                                        {ago(l.createdAt)}
                                    </time>
                                </span>
                                <span data-slot="expiry">{expiryText(l)}</span>
                            </div>
                            {canRevoke({ status }) ? (
                                confirming === l.id ? (
                                    <div
                                        data-slot="revoke"
                                        className="flex items-center gap-1"
                                    >
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            disabled={busy !== null}
                                            onClick={() => void revoke(l)}
                                        >
                                            {t(
                                                'qubdi.workspace.shareList.confirmRevoke'
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy !== null}
                                            onClick={() => setConfirming(null)}
                                        >
                                            {t(
                                                'qubdi.workspace.shareList.keep'
                                            )}
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        data-slot="revoke"
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive hover:text-destructive"
                                        disabled={busy !== null}
                                        onClick={() => setConfirming(l.id)}
                                    >
                                        {t('qubdi.workspace.shareList.revoke')}
                                    </Button>
                                )
                            ) : null}
                        </div>
                        {confirming === l.id ? (
                            <p className="text-xs text-muted-foreground">
                                {t('qubdi.workspace.shareList.revokeWarning')}
                            </p>
                        ) : null}
                        {canRevoke({ status }) && renderControls ? (
                            <div data-slot="controls" className="contents">
                                {renderControls(l)}
                            </div>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
