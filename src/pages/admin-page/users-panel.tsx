import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/platform/ui/button';
import { Badge } from '@/platform/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/platform/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/platform/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/platform/ui/dialog';
import { useToast } from '@/platform/toast/use-toast';
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
import { PasswordField } from '@/components/qubdi/password-field';
import { Input } from '@/platform/ui/input';
import { useQubdi } from '@/hooks/use-qubdi';
import { usePasswordMinLength } from '@/hooks/use-password-min-length';
import { checkPassword } from '../../../shared/password';
import { NewUserDialog } from './new-user-dialog';
import { UserSessionsDialog } from './user-sessions-dialog';
import { PasswordInput } from '@/components/qubdi/password-input';

const PAGE_SIZE = 10;

type TFn = ReturnType<typeof useTranslation>['t'];

/** What to tell the admin after a bulk action: how many it did, and how many it left. */
const bulkToast = (t: TFn, action: BulkUserAction, result: BulkUsersResult) => {
    if (result.changed === 0) {
        return {
            title: t('qubdi.adminUsers.users.nothingToChange'),
            description: t('qubdi.adminUsers.users.nothingToChangeDescription'),
        };
    }
    const done = {
        enable: 'bulkEnabled',
        disable: 'bulkDisabled',
        delete: 'bulkDeleted',
    }[action];
    return {
        title: t(`qubdi.adminUsers.users.${done}`, { count: result.changed }),
        description:
            result.unchanged > 0
                ? t('qubdi.adminUsers.users.leftAsTheyWere', {
                      count: result.unchanged,
                  })
                : undefined,
    };
};

/** The acting admin's own password, and a code when their account has two-factor on. */
const ProofFields: React.FC<{
    needsCode: boolean;
    password: string;
    onPassword: (v: string) => void;
    code: string;
    onCode: (v: string) => void;
}> = ({ needsCode, password, onPassword, code, onCode }) => {
    const { t } = useTranslation();
    return (
        <>
            <p className="text-sm text-muted-foreground">
                {needsCode
                    ? t('qubdi.adminUsers.users.confirmItsYouCode')
                    : t('qubdi.adminUsers.users.confirmItsYou')}
            </p>
            <PasswordInput
                autoComplete="current-password"
                placeholder={t('qubdi.adminUsers.users.ownPassword')}
                aria-label={t('qubdi.adminUsers.users.ownPassword')}
                value={password}
                onChange={(e) => onPassword(e.target.value)}
            />
            {needsCode ? (
                <Input
                    type="text"
                    autoComplete="one-time-code"
                    placeholder={t('qubdi.adminUsers.users.ownCode')}
                    aria-label={t('qubdi.adminUsers.users.ownCode')}
                    value={code}
                    onChange={(e) => onCode(e.target.value)}
                />
            ) : null}
        </>
    );
};

export interface UsersPanelProps {
    currentUserId: string;
}

export const UsersPanel: React.FC<UsersPanelProps> = ({ currentUserId }) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [resetFor, setResetFor] = useState<AdminUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const minLength = usePasswordMinLength(resetFor !== null);
    const resetWeak =
        checkPassword(newPassword, { minLength, email: resetFor?.email })
            .length > 0;
    const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
    const [mfaResetFor, setMfaResetFor] = useState<AdminUser | null>(null);
    // resetting another admin asks for this admin's own password (and code)
    const { user: me } = useQubdi();
    const needsOwnCode = me?.mfaEnabled === true;
    const [ownPassword, setOwnPassword] = useState('');
    const [ownCode, setOwnCode] = useState('');
    const [proofError, setProofError] = useState<string | null>(null);
    const startProof = () => {
        setOwnPassword('');
        setOwnCode('');
        setProofError(null);
    };
    /** What the server wants with a change to this person, or nothing for an ordinary account. */
    const proofFor = (target: AdminUser) =>
        target.isAdmin
            ? {
                  adminPassword: ownPassword,
                  ...(needsOwnCode ? { adminCode: ownCode.trim() } : {}),
              }
            : {};
    const proofMissing = (target: AdminUser | null) =>
        target !== null &&
        target.isAdmin &&
        (ownPassword === '' || (needsOwnCode && ownCode.trim() === ''));
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
    const scope = `${list.page}\u0000${list.query}\u0000${statusFilter}`;
    const [selectedScope, setSelectedScope] = useState(scope);
    if (selectedScope !== scope) {
        setSelectedScope(scope);
        setSelected(new Set());
    }

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

    const run = async (
        fn: () => Promise<unknown>,
        done?: { title: string; description?: string },
        // where a failure is shown: the panel, or a dialog that stays open
        onError: (message: string) => void = setError
    ) => {
        setError(null);
        setBusy(true);
        try {
            await fn();
            list.reload();
            if (done) toast(done);
        } catch (e) {
            onError(errorMessage(e));
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
            toast(bulkToast(t, action, result));
        });
    };

    const createUser = async (user: {
        email: string;
        password: string;
        isAdmin: boolean;
    }) => {
        await api.adminCreateUser(user);
        list.reload();
        toast({
            title: t('qubdi.adminUsers.users.createdTitle'),
            description: t('qubdi.adminUsers.users.createdDescription', {
                email: user.email,
            }),
        });
    };

    return (
        <div className="flex flex-col gap-6">
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
                        placeholder={t(
                            'qubdi.adminUsers.users.searchPlaceholder'
                        )}
                        label={t('qubdi.adminUsers.users.searchLabel')}
                    />
                    <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setCreating(true)}
                    >
                        <Plus className="mr-1.5 size-4" aria-hidden />
                        {t('qubdi.adminUsers.users.newUser')}
                    </Button>
                    <div
                        role="group"
                        aria-label={t('qubdi.adminUsers.users.filterByStatus')}
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
                                    ? t('qubdi.adminUsers.users.filterAll')
                                    : s === 'active'
                                      ? t('qubdi.adminUsers.users.filterActive')
                                      : t(
                                            'qubdi.adminUsers.users.filterDisabled'
                                        )}
                            </Button>
                        ))}
                    </div>
                </div>
                {chosen.length > 0 ? (
                    <div
                        role="toolbar"
                        aria-label={t('qubdi.adminUsers.users.bulkToolbar')}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
                    >
                        <span aria-live="polite">
                            {t('qubdi.adminUsers.users.selected', {
                                count: chosen.length,
                            })}
                        </span>
                        <div className="flex flex-wrap gap-1">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={t(
                                    'qubdi.adminUsers.users.enableSelected'
                                )}
                                disabled={busy}
                                onClick={() => bulk('enable')}
                            >
                                {t('qubdi.adminUsers.users.enable')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={t(
                                    'qubdi.adminUsers.users.disableSelected'
                                )}
                                disabled={busy}
                                onClick={() => setConfirmBulk('disable')}
                            >
                                {t('qubdi.adminUsers.users.disable')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                aria-label={t(
                                    'qubdi.adminUsers.users.deleteSelected'
                                )}
                                className="text-destructive hover:text-destructive"
                                disabled={busy}
                                onClick={() => setConfirmBulk('delete')}
                            >
                                {t('qubdi.adminUsers.users.delete')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelected(new Set())}
                            >
                                {t('qubdi.adminUsers.users.clearSelection')}
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
                                        aria-label={t(
                                            'qubdi.adminUsers.users.selectAll'
                                        )}
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
                                <TableHead>
                                    {t('qubdi.adminUsers.users.colEmail')}
                                </TableHead>
                                <TableHead>
                                    {t('qubdi.adminUsers.users.colRole')}
                                </TableHead>
                                <TableHead>
                                    {t('qubdi.adminUsers.users.colStatus')}
                                </TableHead>
                                <TableHead>
                                    {t('qubdi.adminUsers.users.colLastSignIn')}
                                </TableHead>
                                <TableHead className="text-right">
                                    {t('qubdi.adminUsers.users.colProjects')}
                                </TableHead>
                                <TableHead className="text-right">
                                    {t('qubdi.adminUsers.users.colActions')}
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
                                        {t('qubdi.adminUsers.users.loading')}
                                    </TableCell>
                                </TableRow>
                            ) : list.items.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-muted-foreground"
                                    >
                                        {list.query
                                            ? t(
                                                  'qubdi.adminUsers.users.noMatch',
                                                  { query: list.query }
                                              )
                                            : statusFilter === 'active'
                                              ? t(
                                                    'qubdi.adminUsers.users.noActive'
                                                )
                                              : statusFilter === 'disabled'
                                                ? t(
                                                      'qubdi.adminUsers.users.noDisabled'
                                                  )
                                                : t(
                                                      'qubdi.adminUsers.users.noUsers'
                                                  )}
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
                                                    aria-label={t(
                                                        'qubdi.adminUsers.users.selectUser',
                                                        { email: u.email }
                                                    )}
                                                    title={
                                                        self
                                                            ? t(
                                                                  'qubdi.adminUsers.users.cannotSelectSelf'
                                                              )
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
                                                        {t(
                                                            'qubdi.adminUsers.users.you'
                                                        )}
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
                                                        ? t(
                                                              'qubdi.adminUsers.users.admin'
                                                          )
                                                        : t(
                                                              'qubdi.adminUsers.users.member'
                                                          )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    <Badge
                                                        variant={
                                                            u.isActive
                                                                ? 'outline'
                                                                : 'destructive'
                                                        }
                                                    >
                                                        {u.isActive
                                                            ? t(
                                                                  'qubdi.adminUsers.users.active'
                                                              )
                                                            : t(
                                                                  'qubdi.adminUsers.users.disabled'
                                                              )}
                                                    </Badge>
                                                    {u.mfaEnabled ? (
                                                        <Badge
                                                            variant="secondary"
                                                            title={t(
                                                                'qubdi.adminUsers.users.twoFactorHint'
                                                            )}
                                                        >
                                                            {t(
                                                                'qubdi.adminUsers.users.twoFactorBadge'
                                                            )}
                                                        </Badge>
                                                    ) : null}
                                                </div>
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
                                                        {t(
                                                            'qubdi.adminUsers.users.never'
                                                        )}
                                                    </span>
                                                )}
                                                {u.lastActiveAt ? (
                                                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                                        <span
                                                            aria-hidden
                                                            className="size-1.5 rounded-full bg-current"
                                                        />
                                                        {t(
                                                            'qubdi.adminUsers.users.signedInNow'
                                                        )}
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
                                                            run(
                                                                () =>
                                                                    api.adminUpdateUser(
                                                                        u.id,
                                                                        {
                                                                            isAdmin:
                                                                                !u.isAdmin,
                                                                        }
                                                                    ),
                                                                {
                                                                    title: u.isAdmin
                                                                        ? t(
                                                                              'qubdi.adminUsers.users.adminRemoved'
                                                                          )
                                                                        : t(
                                                                              'qubdi.adminUsers.users.madeAdmin'
                                                                          ),
                                                                    description:
                                                                        u.email,
                                                                }
                                                            )
                                                        }
                                                    >
                                                        {u.isAdmin
                                                            ? t(
                                                                  'qubdi.adminUsers.users.removeAdmin'
                                                              )
                                                            : t(
                                                                  'qubdi.adminUsers.users.makeAdmin'
                                                              )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={busy || self}
                                                        onClick={() =>
                                                            run(
                                                                () =>
                                                                    api.adminUpdateUser(
                                                                        u.id,
                                                                        {
                                                                            isActive:
                                                                                !u.isActive,
                                                                        }
                                                                    ),
                                                                {
                                                                    title: u.isActive
                                                                        ? t(
                                                                              'qubdi.adminUsers.users.userDisabled'
                                                                          )
                                                                        : t(
                                                                              'qubdi.adminUsers.users.userEnabled'
                                                                          ),
                                                                    description:
                                                                        u.email,
                                                                }
                                                            )
                                                        }
                                                    >
                                                        {u.isActive
                                                            ? t(
                                                                  'qubdi.adminUsers.users.disable'
                                                              )
                                                            : t(
                                                                  'qubdi.adminUsers.users.enable'
                                                              )}
                                                    </Button>
                                                    {/* the rarer actions are icons, so the row fits; each has a name for a screen reader and a tooltip */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label={t(
                                                            'qubdi.adminUsers.users.resetPasswordOf',
                                                            { email: u.email }
                                                        )}
                                                        title={t(
                                                            'qubdi.adminUsers.users.resetPassword'
                                                        )}
                                                        onClick={() => {
                                                            setNewPassword('');
                                                            startProof();
                                                            setResetFor(u);
                                                        }}
                                                    >
                                                        <KeyRound />
                                                    </Button>
                                                    {u.mfaEnabled && !self ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8"
                                                            aria-label={t(
                                                                'qubdi.adminUsers.users.resetTwoFactorOf',
                                                                {
                                                                    email: u.email,
                                                                }
                                                            )}
                                                            title={t(
                                                                'qubdi.adminUsers.users.resetTwoFactorHint'
                                                            )}
                                                            disabled={busy}
                                                            onClick={() => {
                                                                startProof();
                                                                setMfaResetFor(
                                                                    u
                                                                );
                                                            }}
                                                        >
                                                            <Smartphone />
                                                        </Button>
                                                    ) : null}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8"
                                                        aria-label={t(
                                                            'qubdi.adminUsers.users.sessionsOf',
                                                            { email: u.email }
                                                        )}
                                                        disabled={self}
                                                        title={
                                                            self
                                                                ? t(
                                                                      'qubdi.adminUsers.users.useSignOut'
                                                                  )
                                                                : t(
                                                                      'qubdi.adminUsers.users.sessions'
                                                                  )
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
                                                        aria-label={t(
                                                            'qubdi.adminUsers.users.deleteOf',
                                                            { email: u.email }
                                                        )}
                                                        title={
                                                            self
                                                                ? t(
                                                                      'qubdi.adminUsers.users.cannotDeleteSelf'
                                                                  )
                                                                : t(
                                                                      'qubdi.adminUsers.users.deleteUserHint'
                                                                  )
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
                    noun={t('qubdi.adminUsers.users.pagerNoun')}
                />
            </div>

            <Dialog
                open={resetFor !== null}
                onOpenChange={(o) => !o && setResetFor(null)}
            >
                <DialogContent className="max-w-sm" showClose>
                    <DialogHeader>
                        <DialogTitle>
                            {t('qubdi.adminUsers.users.resetPassword')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('qubdi.adminUsers.users.resetDescription', {
                                email: resetFor?.email ?? '',
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const target = resetFor;
                            if (!target) return;
                            setProofError(null);
                            void run(
                                async () => {
                                    await api.adminUpdateUser(target.id, {
                                        password: newPassword,
                                        ...proofFor(target),
                                    });
                                    setResetFor(null);
                                    toast({
                                        title: t(
                                            'qubdi.adminUsers.users.passwordChanged'
                                        ),
                                        description: t(
                                            'qubdi.adminUsers.users.signedOutEverywhere',
                                            {
                                                email: target.email,
                                            }
                                        ),
                                    });
                                },
                                undefined,
                                setProofError
                            );
                        }}
                    >
                        <PasswordField
                            placeholder={t(
                                'qubdi.adminUsers.users.newPassword'
                            )}
                            value={newPassword}
                            onChange={setNewPassword}
                            minLength={minLength}
                            email={resetFor?.email}
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opened on request; focus goes to its first field
                            autoFocus
                        />
                        {resetFor?.isAdmin ? (
                            <ProofFields
                                needsCode={needsOwnCode}
                                password={ownPassword}
                                onPassword={setOwnPassword}
                                code={ownCode}
                                onCode={setOwnCode}
                            />
                        ) : null}
                        {proofError ? (
                            <p role="alert" className="text-sm text-red-500">
                                {proofError}
                            </p>
                        ) : null}
                        <Button
                            type="submit"
                            disabled={
                                busy || resetWeak || proofMissing(resetFor)
                            }
                        >
                            {t('qubdi.adminUsers.users.setPassword')}
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
                        <AlertDialogTitle>
                            {t('qubdi.adminUsers.users.deleteTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('qubdi.adminUsers.users.deleteDescription', {
                                email: deleteFor?.email ?? '',
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('qubdi.adminUsers.users.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = deleteFor;
                                if (target) {
                                    void run(
                                        () => api.adminDeleteUser(target.id),
                                        {
                                            title: t(
                                                'qubdi.adminUsers.users.userDeleted'
                                            ),
                                            description: target.email,
                                        }
                                    );
                                }
                            }}
                        >
                            {t('qubdi.adminUsers.users.deleteUserHint')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={mfaResetFor !== null}
                onOpenChange={(o) => !o && setMfaResetFor(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('qubdi.adminUsers.users.resetMfaTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('qubdi.adminUsers.users.resetMfaDescription', {
                                email: mfaResetFor?.email ?? '',
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {mfaResetFor?.isAdmin ? (
                        <div className="flex flex-col gap-3">
                            <ProofFields
                                needsCode={needsOwnCode}
                                password={ownPassword}
                                onPassword={setOwnPassword}
                                code={ownCode}
                                onCode={setOwnCode}
                            />
                        </div>
                    ) : null}
                    {proofError ? (
                        <p role="alert" className="text-sm text-red-500">
                            {proofError}
                        </p>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('qubdi.adminUsers.users.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy || proofMissing(mfaResetFor)}
                            onClick={(e) => {
                                // stays open while it runs, so a wrong password can be corrected
                                e.preventDefault();
                                const target = mfaResetFor;
                                if (target) {
                                    setProofError(null);
                                    void run(
                                        async () => {
                                            await (target.isAdmin
                                                ? api.adminResetMfa(
                                                      target.id,
                                                      proofFor(target)
                                                  )
                                                : api.adminResetMfa(target.id));
                                            setMfaResetFor(null);
                                        },
                                        {
                                            title: t(
                                                'qubdi.adminUsers.users.mfaResetDone'
                                            ),
                                            description: t(
                                                'qubdi.adminUsers.users.signedOutEverywhere',
                                                {
                                                    email: target.email,
                                                }
                                            ),
                                        },
                                        setProofError
                                    );
                                }
                            }}
                        >
                            {t('qubdi.adminUsers.users.resetMfaAction')}
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
                            {confirmBulk === 'delete'
                                ? t('qubdi.adminUsers.users.bulkDeleteTitle', {
                                      count: chosen.length,
                                  })
                                : t('qubdi.adminUsers.users.bulkDisableTitle', {
                                      count: chosen.length,
                                  })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmBulk === 'delete'
                                ? t(
                                      'qubdi.adminUsers.users.bulkDeleteDescription'
                                  )
                                : t(
                                      'qubdi.adminUsers.users.bulkDisableDescription'
                                  )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('qubdi.adminUsers.users.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirmBulk) bulk(confirmBulk);
                            }}
                        >
                            {confirmBulk === 'delete'
                                ? t('qubdi.adminUsers.users.bulkDeleteAction', {
                                      count: chosen.length,
                                  })
                                : t(
                                      'qubdi.adminUsers.users.bulkDisableAction',
                                      {
                                          count: chosen.length,
                                      }
                                  )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <NewUserDialog
                open={creating}
                onOpenChange={setCreating}
                onCreate={createUser}
            />

            <UserSessionsDialog
                user={sessionsFor}
                onClose={() => setSessionsFor(null)}
                onSignedOut={list.reload}
            />
        </div>
    );
};
