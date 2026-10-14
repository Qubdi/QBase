import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/button/button';
import { Badge } from '@/components/badge/badge';
import { Input } from '@/components/input/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/table/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/alert-dialog/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { api, errorMessage, type AdminUser } from '@/lib/qubdi/api';

export interface UsersPanelProps {
    currentUserId: string;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({ currentUserId }) => {
    const [users, setUsers] = useState<AdminUser[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [busy, setBusy] = useState(false);
    const [resetFor, setResetFor] = useState<AdminUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);

    const reload = useCallback(async () => {
        try {
            setUsers(await api.adminListUsers());
        } catch (e) {
            setError(errorMessage(e));
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const run = async (fn: () => Promise<unknown>) => {
        setError(null);
        setBusy(true);
        try {
            await fn();
            await reload();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const createUser = (e: React.FormEvent) => {
        e.preventDefault();
        void run(async () => {
            await api.adminCreateUser({ email, password, isAdmin });
            setEmail('');
            setPassword('');
            setIsAdmin(false);
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <form
                onSubmit={createUser}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
                aria-label="Create user"
            >
                <div>
                    <h2 className="font-primary text-base font-semibold">
                        Create user
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        People cannot sign themselves up. Create their account
                        here, then assign them to projects.
                    </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                        type="email"
                        placeholder="Email"
                        autoComplete="off"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Temporary password (min 8)"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={8}
                        required
                    />
                    <Button type="submit" disabled={busy}>
                        Create user
                    </Button>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={isAdmin}
                        onChange={(e) => setIsAdmin(e.target.checked)}
                        className="size-4 accent-primary"
                    />
                    Make this user an admin
                </label>
            </form>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            <div className="rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">
                                Projects
                            </TableHead>
                            <TableHead className="text-right">
                                Actions
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users === null ? (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    className="text-muted-foreground"
                                >
                                    Loading…
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((u) => {
                                const self = u.id === currentUserId;
                                return (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">
                                            {u.email}
                                            {self ? (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    (you)
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    u.isAdmin
                                                        ? 'default'
                                                        : 'secondary'
                                                }
                                            >
                                                {u.isAdmin ? 'Admin' : 'Member'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {u.projects}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={busy || self}
                                                    onClick={() =>
                                                        run(() =>
                                                            api.adminUpdateUser(
                                                                u.id,
                                                                {
                                                                    isAdmin:
                                                                        !u.isAdmin,
                                                                }
                                                            )
                                                        )
                                                    }
                                                >
                                                    {u.isAdmin
                                                        ? 'Remove admin'
                                                        : 'Make admin'}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setNewPassword('');
                                                        setResetFor(u);
                                                    }}
                                                >
                                                    Reset password
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    disabled={busy || self}
                                                    onClick={() =>
                                                        setDeleteFor(u)
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog
                open={resetFor !== null}
                onOpenChange={(o) => !o && setResetFor(null)}
            >
                <DialogContent className="max-w-sm" showClose>
                    <DialogHeader>
                        <DialogTitle>Reset password</DialogTitle>
                        <DialogDescription>
                            Set a new password for {resetFor?.email}. They will
                            be signed out everywhere.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const target = resetFor;
                            if (!target) return;
                            void run(async () => {
                                await api.adminUpdateUser(target.id, {
                                    password: newPassword,
                                });
                                setResetFor(null);
                            });
                        }}
                    >
                        <Input
                            type="password"
                            placeholder="New password (min 8)"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={8}
                            required
                        />
                        <Button type="submit" disabled={busy}>
                            Set password
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={deleteFor !== null}
                onOpenChange={(o) => !o && setDeleteFor(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete user?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteFor?.email} will lose access immediately.
                            Diagrams they created inside projects stay with the
                            project; their personal diagrams are deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = deleteFor;
                                if (target) {
                                    void run(() =>
                                        api.adminDeleteUser(target.id)
                                    );
                                }
                            }}
                        >
                            Delete user
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
