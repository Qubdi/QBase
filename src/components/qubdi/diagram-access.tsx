import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/button/button';
import { Logo } from '@/components/logo/logo';
import { Spinner } from '@/components/spinner/spinner';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { useQubdi } from '@/hooks/use-qubdi';
import { isLocked, resolveAccess, type AccessState } from '@/lib/qubdi/access';
import { api } from '@/lib/qubdi/api';
import {
    getRemoteId,
    getProjectId,
    setProjectId,
} from '@/lib/qubdi/remote-map';
import { AuthDialog } from './auth-dialog';
import {
    DiagramAccessContext,
    type DiagramAccessValue,
} from './diagram-access-context';

/** Asks the server what the signed-in user may do with the open diagram. */
function useResolvedAccess(localId: string | undefined): DiagramAccessValue {
    const { enabled, user } = useQubdi();
    const [access, setAccess] = useState<AccessState>({ status: 'loading' });
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        if (!enabled) {
            setAccess({ status: 'off' });
            return;
        }
        if (user === undefined) {
            setAccess({ status: 'loading' });
            return;
        }
        if (user === null) {
            setAccess({ status: 'signed_out' });
            return;
        }
        const remoteId = localId ? getRemoteId(localId) : undefined;
        if (!remoteId) {
            setAccess({ status: 'unbound' });
            return;
        }
        let cancelled = false;
        setAccess({ status: 'loading' });
        api.listDiagrams()
            .then((list) => {
                if (cancelled) return;
                const next = resolveAccess(remoteId, list);
                if (next.status === 'editor' || next.status === 'viewer') {
                    // remember it so features that need the project can read it
                    if (localId && getProjectId(localId) !== next.projectId) {
                        setProjectId(localId, next.projectId);
                    }
                }
                setAccess(next);
            })
            .catch(() => !cancelled && setAccess({ status: 'error' }));
        return () => {
            cancelled = true;
        };
    }, [enabled, user, localId, tick]);

    return useMemo(() => ({ access, refresh }), [access, refresh]);
}

const Centered: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        {children}
    </div>
);

/**
 * Wraps the editor's data layer. With a backend, the editor needs a signed-in
 * user, and a diagram is editable only through a project role; every other
 * case opens read-only (the editor stops changing or storing anything).
 */
export const DiagramAccessGate: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const value = useResolvedAccess(diagramId);
    const [authOpen, setAuthOpen] = useState(false);
    const { status } = value.access;

    if (status === 'off') {
        return <ChartDBProvider>{children}</ChartDBProvider>;
    }

    if (status === 'loading') {
        return (
            <Centered>
                <Spinner size="large" className="text-primary" />
            </Centered>
        );
    }

    if (status === 'signed_out') {
        return (
            <Centered>
                <Logo />
                <p className="max-w-sm text-sm text-muted-foreground">
                    Sign in to open your projects. Accounts are created by an
                    admin.
                </p>
                <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
                <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
            </Centered>
        );
    }

    return (
        <DiagramAccessContext.Provider value={value}>
            <ChartDBProvider readonly={isLocked(value.access) || undefined}>
                {children}
            </ChartDBProvider>
        </DiagramAccessContext.Provider>
    );
};
