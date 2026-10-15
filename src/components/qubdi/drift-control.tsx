import React, { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/button/button';
import { useDiagram } from '@/hooks/use-diagram';
import { useQubdi } from '@/hooks/use-qubdi';
import { api, type DriftBadge } from '@/lib/qubdi/api';
import {
    badgeLabel,
    badgeSeverity,
    SEVERITY_CLASS,
} from '@/lib/qubdi/drift-ui';
import { DriftDialog } from './drift-dialog';

/** Toolbar entry for drift detection: shows a badge when the database has drifted. */
export const DriftControl: React.FC = () => {
    const { enabled, user, remoteIdFor } = useQubdi();
    const { currentDiagram } = useDiagram();
    const [open, setOpen] = useState(false);
    const [badge, setBadge] = useState<DriftBadge | null>(null);
    const remoteId = remoteIdFor(currentDiagram.id);

    const refresh = useCallback(async () => {
        if (!remoteId) {
            setBadge(null);
            return;
        }
        try {
            setBadge((await api.getDrift(remoteId)).badge);
        } catch {
            // keep the last known badge; the dialog reports real errors
        }
    }, [remoteId]);

    useEffect(() => {
        if (!user) return;
        void refresh();
        const timer = setInterval(() => void refresh(), 60_000);
        return () => clearInterval(timer);
    }, [user, refresh]);

    if (!enabled || !user) return null;

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
                Drift
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
