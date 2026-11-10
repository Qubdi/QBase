import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/platform/ui/button';
import { useDiagram } from '@/qbase/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, type DriftBadge } from '@/lib/qubdi/api';
import { checkDriftOnOpen } from '@/lib/qubdi/auto-drift';
import {
    badgeLabel,
    badgeSeverity,
    SEVERITY_CLASS,
} from '@/lib/qubdi/drift-ui';
import { useDiagramAccess } from './diagram-access-context';
import { DriftDialog } from './drift-dialog';

/** Toolbar entry for drift detection: shows a badge when the database has drifted. */
export const DriftControl: React.FC = () => {
    const { t } = useTranslation();
    const { enabled, user, remoteIdFor } = useQubdi();
    const { currentDiagram } = useDiagram();
    const { access } = useDiagramAccess();
    // only the editor who holds the diagram manages its drift from here
    const canManage = access.status === 'editor';
    const [open, setOpen] = useState(false);
    const [badge, setBadge] = useState<DriftBadge | null>(null);
    const remoteId = remoteIdFor(currentDiagram.id);
    const shownRemoteId = useRef(remoteId);
    // runs before the effects below, so they and the replies they wait for see
    // the diagram that is shown now
    useEffect(() => {
        shownRemoteId.current = remoteId;
    });
    // no diagram: no badge. Reset while rendering, when the id goes away.
    const [seenRemoteId, setSeenRemoteId] = useState(remoteId);
    if (seenRemoteId !== remoteId) {
        setSeenRemoteId(remoteId);
        if (!remoteId) setBadge(null);
    }
    const checkedOnOpen = useRef<string | undefined>(undefined);

    const refresh = useCallback(() => {
        if (!remoteId) return Promise.resolve();
        return api.getDrift(remoteId).then(
            ({ badge: next }) => {
                // the person may have moved to another diagram while it ran
                if (shownRemoteId.current === remoteId) setBadge(next);
            },
            () => {
                // keep the last known badge; the dialog reports real errors
            }
        );
    }, [remoteId]);

    useEffect(() => {
        if (!user || !canManage) return;
        void refresh();
        // a background tab does not need a fresh badge every minute; it gets
        // one when the tab is shown again
        const timer = setInterval(() => {
            if (!document.hidden) void refresh();
        }, 60_000);
        const shown = () => {
            if (!document.hidden) void refresh();
        };
        document.addEventListener('visibilitychange', shown);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', shown);
        };
    }, [user, canManage, refresh]);

    // opening a diagram fetches from its database once; the timer above only
    // re-reads the stored result
    useEffect(() => {
        if (
            !user ||
            !canManage ||
            !remoteId ||
            checkedOnOpen.current === remoteId
        )
            return;
        checkedOnOpen.current = remoteId;
        void checkDriftOnOpen(remoteId).then((next) => {
            // the person may have moved to another diagram while it ran
            if (next !== undefined && shownRemoteId.current === remoteId) {
                setBadge(next);
            }
        });
    }, [user, canManage, remoteId]);

    // a viewer, or an editor whose lock went to someone else, does not manage drift here
    if (!enabled || !user || !canManage) return null;

    const label = badgeLabel(badge);
    const severity = badgeSeverity(badge);

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setOpen(true)}
            >
                <Activity className="size-4" />
                {t('qubdi.database.drift.control')}
                {label && severity ? (
                    <span
                        data-testid="drift-badge"
                        className={`rounded-full px-1.5 text-[10px] font-semibold ${SEVERITY_CLASS[severity]}`}
                    >
                        {label}
                    </span>
                ) : null}
            </Button>
            <DriftDialog
                open={open}
                onOpenChange={(o) => {
                    setOpen(o);
                    if (!o) void refresh();
                }}
                onBadgeChange={setBadge}
            />
        </>
    );
};
