import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Monitor, Trash2 } from 'lucide-react';
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
import { useToast } from '@/components/toast/use-toast';
import { ListPager } from '@/components/qubdi/list-pager';
import { SearchInput } from '@/components/qubdi/search-input';
import { usePagedList } from '@/hooks/use-paged-list';
import {
    api,
    errorMessage,
    type AdminUser,
    type BulkUserAction,
    type BulkUsersResult,
    type UserStatus,
} from '@/lib/qubdi/api';
import { ago, exactTime } from '@/lib/qubdi/when';
import { UserSessionsDialog } from './user-sessions-dialog';

const PAGE_SIZE = 10;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const BULK_DONE: Record<BulkUserAction, string> = {
    enable: 'Enabled',
    disable: 'Disabled',
    delete: 'Deleted',
};

/** What to tell the admin after a bulk action: how many it did, and how many it left. */
const bulkToast = (action: BulkUserAction, result: BulkUsersResult) =>
    result.changed === 0
        ? {
              title: 'Nothing to change',
              description:
                  'They were already in that state, or no longer exist.',
          }
        : {
              title: `${BULK_DONE[action]} ${plural(result.changed, 'user')}`,
              description:
                  result.unchanged > 0
                      ? `${plural(result.unchanged, 'account')} left as they were.`
                      : undefined,
          };

export interface UsersPanelProps {
    currentUserId: string;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({ currentUserId }) => {
    const { toast } = useToast();
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [busy, setBusy] = useState(false);
    const [resetFor, setResetFor] = useState<AdminUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
    const [sessionsFor, setSessionsFor] = useState<AdminUser | null>(null);
    // the people ticked for a bulk action, and the action waiting to be confirmed
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [confirmBulk, setConfirmBulk] = useState<Exclude<
        BulkUserAction,
        'enable'
    > | null>(null);

    // a fixed page size keeps the panel the same height however many users exist
    const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
    const list = usePagedList(
        ({ page, limit, q, filter }) =>
            api.adminListUsers({
                page,
                limit,
                q,
                status: filter ? (filter as UserStatus) : undefined,
            }),
        { limit: PAGE_SIZE, filter: statusFilter === 'all' ? '' : statusFilter }
    );

    // a tick belongs to the rows it was made on: another page, search or
    // filter starts with nothing ticked, so "3 selected" never counts rows
    // that are out of sight
    useEffect(() => {
        setSelected(new Set());
    }, [list.page, list.query, statusFilter]);

    // only rows that are on this page and that may be acted on in bulk (the
    // server refuses the caller in a disable or delete)
    const selectable = useMemo(
        () => list.items.filter((u) => u.id !== currentUserId),
        [list.items, currentUserId]
    );
    const chosen = useMemo(
        () => selectable.filter((u) => selected.has(u.id)),
        [selectable, selected]
    );
    const allChosen =
        selectable.length > 0 && chosen.length === selectable.length;
    const someChosen = chosen.length > 0 && !allChosen;
    const selectAll = useRef<HTMLInputElement>(null);
    useEffect(() => {
        // "some but not all" has no HTML attribute: it is set on the element
        if (selectAll.current) selectAll.current.indeterminate = someChosen;
    }, [someChosen]);

    const toggle = (id: string, on: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });

    const run = async (fn: () => Promise<unknown>) => {
        setError(null);
        setBusy(true);
        try {
            await fn();
            list.reload();
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    /** The same action on everyone ticked; nothing changes unless all of it can. */
    const bulk = (action: BulkUserAction) => {
        const ids = chosen.map((u) => u.id);
        void run(async () => {
            const result = await api.adminBulkUsers(action, ids);
            setSelected(new Set());
            toast(bulkToast(action, result));
        });
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
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
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
                    />
                    Make this user an admin
                </label>
            </form>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            {list.error ? (
                <p role="alert" className="text-sm text-destructive">
                    {list.error}
                </p>
            ) : null}

            <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-xs">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SearchInput
                        className="flex-1"
                        value={list.query}
                        onChange={list.setQuery}
                        placeholder="Search users by email…"
                        label="Search users"
                    />
                    <div
                        role="group"
                        aria-label="Filter by status"
                        className="flex shrink-0 gap-1"
                    >
                        {(['all', 'active', 'disabled'] as const).map((s) => (
                            <Button
                                key={s}
                                type="button"
                                size="sm"
                                variant={
                                    statusFilter === s ? 'secondary' : 'ghost'
                                }
                                aria-pressed={statusFilter === s}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s === 'all'
                                    ? 'All'
                                    : s === 'active'
                                      ? 'Active'
                                      : 'Disabled'}
                            </Button>
                        ))}
                    </div>
                </div>
                {chosen.length > 0 ? (
                    <div
                        role="toolbar"
                        aria-label="Actions for the selected users"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
                    >
                        <span aria-live="polite">{chosen.length} selected</span>
                        <div className="flex flex-wrap gap-1">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label="Enable selected users"
                                disabled={busy}
                                onClick={() => bulk('enable')}
                            >
                                Enable
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label="Disable selected users"
                                disabled={busy}
                                onClick={() => setConfirmBulk('disable')}
                            >
                                Disable
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label="Delete selected users"
                                className="text-destructive hover:text-destructive"
                                disabled={busy}
                                onClick={() => setConfirmBulk('delete')}
                            >
                                Delete
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelected(new Set())}
                            >
                                Clear selection
                            </Button>
                        </div>
                    </div>
                ) : null}
                <div className="max-h-[26rem] min-h-40 overflow-y-auto [&_td]:px-2.5 [&_th]:px-2.5">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                                <TableHead className="w-10">
                                    <input
                                        ref={selectAll}
                                        type="checkbox"
                                        aria-label="Select all users on this page"
                                        checked={allChosen}
                                        disabled={
                                            busy || selectable.length === 0
                                        }
                                        onChange={(e) =>
                                            setSelected(
                                                e.target.checked
                                                    ? new Set(
                                                          selectable.map(
                                                              (u) => u.id
                                                          )
                                                      )
                                                    : new Set()
                                            )
                                        }
                                    />
                                </TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last sign-in</TableHead>
                                <TableHead className="text-right">
                                    Projects
                                </TableHead>
                                <TableHead className="text-right">
                                    Actions
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.initialLoading ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        Loading…
                                    </TableCell>
                                </TableRow>
                            ) : list.items.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {list.query
                                            ? `No users match "${list.query}".`
                                            : statusFilter !== 'all'
                                              ? `No ${statusFilter} users.`
                                              : 'No users yet.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                list.items.map((u) => {
                                    const self = u.id === currentUserId;
                                    return (
                                        <TableRow
                                            key={u.id}
                                            className={
                                                u.isActive
                                                    ? undefined
                                                    : 'text-muted-foreground'
                                            }
                                        >
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${u.email}`}
                                                    title={
                                                        self
                                                            ? 'You cannot select yourself'
                                                            : undefined
                                                    }
                                                    checked={selected.has(u.id)}
                                                    disabled={busy || self}
                                                    onChange={(e) =>
                                                        toggle(
                                                            u.id,
                                                            e.target.checked
                                                        )
                                                    }
                                                />
                                            </TableCell>
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
                                                    {u.isAdmin
                                                        ? 'Admin'
                                                        : 'Member'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={
                                                        u.isActive
                                                            ? 'outline'
                                                            : 'destructive'
                                                    }
                                                >
                                                    {u.isActive
                                                        ? 'Active'
                                                        : 'Disabled'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {u.lastLoginAt ? (
                                                    <time
                                                        dateTime={u.lastLoginAt}
                                                        title={exactTime(
                                                            u.lastLoginAt
                                                        )}
                                                    >
                                                        {ago(u.lastLoginAt)}
                                                    </time>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        Never
                                                    </span>
                                                )}
                                                {u.lastActiveAt ? (
                                                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                        <span
                                                            aria-hidden
                                                            className="size-1.5 rounded-full bg-current"
                                                        />
                                                        Signed in
                                                    </span>
                                                ) : null}
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
                                                        disabled={busy || self}
                                                        onClick={() =>
                                                            run(() =>
                                                                api.adminUpdateUser(
                                                                    u.id,
                                                                    {
                                                                        isActive:
                                                                            !u.isActive,
                                                                    }
                                                                )
                                                            )
                                                        }
                                                    >
                                                        {u.isActive
                                                            ? 'Disable'
                                                            : 'Enable'}
                                                    </Button>
                                                    {/* the rarer actions are icons, so the row fits; each has a name for a screen reader and a tooltip */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label={`Reset password of ${u.email}`}
                                                        title="Reset password"
                                                        onClick={() => {
                                                            setNewPassword('');
                                                            setResetFor(u);
                                                        }}
                                                    >
                                                        <KeyRound />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label={`Sessions of ${u.email}`}
                                                        disabled={self}
                                                        title={
                                                            self
                                                                ? 'Use Sign out in the account menu'
                                                                : 'Sessions'
                                                        }
                                                        onClick={() =>
                                                            setSessionsFor(u)
                                                        }
                                                    >
                                                        <Monitor />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 text-destructive hover:text-destructive"
                                                        aria-label={`Delete ${u.email}`}
                                                        title={
                                                            self
                                                                ? 'You cannot delete yourself'
                                                                : 'Delete user'
                                                        }
                                                        disabled={busy || self}
                                                        onClick={() =>
                                                            setDeleteFor(u)
                                                        }
                                                    >
                                                        <Trash2 />
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
                <ListPager
                    page={list.page}
                    pageCount={list.pageCount}
                    limit={list.limit}
                    total={list.total}
                    onPageChange={list.setPage}
                    disabled={list.loading}
                    noun="users"
                />
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
                            Diagrams they created stay with their projects and
                            become yours.
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

            <AlertDialog
                open={confirmBulk !== null}
                onOpenChange={(o) => !o && setConfirmBulk(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmBulk === 'delete' ? 'Delete' : 'Disable'}{' '}
                            {plural(chosen.length, 'user')}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmBulk === 'delete'
                                ? 'They lose access immediately and the accounts cannot be brought back. Diagrams they created stay with their projects and become yours.'
                                : 'They are signed out at once and cannot sign in until you enable them again. Their diagrams and project access stay as they are.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirmBulk) bulk(confirmBulk);
                            }}
                        >
                            {confirmBulk === 'delete'
                                ? `Delete ${plural(chosen.length, 'user')}`
                                : `Disable ${plural(chosen.length, 'user')}`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <UserSessionsDialog
                user={sessionsFor}
                onClose={() => setSessionsFor(null)}
                onSignedOut={list.reload}
            />
        </div>
    );
};
