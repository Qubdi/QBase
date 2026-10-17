import React, { useEffect, useState } from 'react';
import { Button } from '@/components/button/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { useToast } from '@/components/toast/use-toast';
import { describeBrowser } from '@/lib/qubdi/browser';
import { ago, exactTime } from '@/lib/qubdi/when';
import {
    api,
    errorMessage,
    type AdminSession,
    type AdminUser,
} from '@/lib/qubdi/api';

export interface UserSessionsDialogProps {
    /** the user whose sessions are shown; null keeps the dialog closed */
    user: AdminUser | null;
    onClose: () => void;
    /** called after the user was signed out, so the list can refresh */
    onSignedOut: () => void;
}

/** Where a user is signed in, and a way to end it. */
export const UserSessionsDialog: React.FC<UserSessionsDialogProps> = ({
    user,
    onClose,
    onSignedOut,
}) => {
    const { toast } = useToast();
    const [sessions, setSessions] = useState<AdminSession[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const userId = user?.id;

    useEffect(() => {
        setSessions(null);
        setError(null);
        if (!userId) return;
        let stale = false;
        api.adminListUserSessions(userId)
            .then((list) => {
                if (!stale) setSessions(list);
            })
            .catch((e: unknown) => {
                if (!stale) setError(errorMessage(e));
            });
        return () => {
            stale = true;
        };
    }, [userId]);

    const signOut = async () => {
        if (!user) return;
        setError(null);
        setBusy(true);
        try {
            const { signedOut } = await api.adminSignOutUser(user.id);
            setSessions([]);
            onSignedOut();
            toast({
                title: signedOut > 0 ? 'Signed out' : 'Already signed out',
                description:
                    signedOut > 0
                        ? `${user.email} has been signed out everywhere.`
                        : `${user.email} was not signed in.`,
            });
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md" showClose>
                <DialogHeader>
                    <DialogTitle>Sessions</DialogTitle>
                    <DialogDescription>
                        {user?.email}. An account has one live session: signing
                        in somewhere else ends the one before it.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}

                {sessions === null && !error ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : sessions !== null && sessions.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Not signed in anywhere.
                    </p>
                ) : (
                    <ul
                        aria-label="Live sessions"
                        className="flex flex-col gap-2"
                    >
                        {sessions?.map((s) => (
                            <li
                                key={s.createdAt}
                                className="flex flex-col gap-0.5 rounded-md border p-3 text-sm"
                            >
                                <span className="font-medium">
                                    {describeBrowser(s.userAgent)}
                                </span>
                                <span className="text-muted-foreground">
                                    Signed in{' '}
                                    <time
                                        dateTime={s.createdAt}
                                        title={exactTime(s.createdAt)}
                                    >
                                        {ago(s.createdAt)}
                                    </time>
                                    , last active{' '}
                                    <time
                                        dateTime={s.lastSeenAt}
                                        title={exactTime(s.lastSeenAt)}
                                    >
                                        {ago(s.lastSeenAt)}
                                    </time>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={busy || !sessions || sessions.length === 0}
                        onClick={() => void signOut()}
                    >
                        Sign out everywhere
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
