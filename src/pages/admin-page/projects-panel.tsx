import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/button/button';
import { OptionSelect } from '@/components/option-select/option-select';
import { Input } from '@/components/input/input';
import { Link } from 'react-router-dom';
import { projectHomePath } from '@/lib/qubdi/project-path';
import { ListPager } from '@/components/qubdi/list-pager';
import { SearchInput } from '@/components/qubdi/search-input';
import { UserPicker } from '@/components/qubdi/user-picker';
import { usePagedList } from '@/hooks/use-paged-list';
import { cn } from '@/lib/utils';
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
    api,
    errorMessage,
    type AdminProject,
    type AdminUser,
    type ProjectMember,
    type ProjectRole,
} from '@/lib/qubdi/api';

const PAGE_SIZE = 8;

const ROLE_OPTIONS = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
];

const roleHelp: Record<ProjectRole, string> = {
    editor: 'Can create and edit diagrams in this project',
    viewer: 'Can only read published diagrams',
};

export const ProjectsPanel: React.FC = () => {
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // the chosen project can sit on another page or be filtered out of the list
    const [selectedCache, setSelectedCache] = useState<AdminProject | null>(
        null
    );
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [assignUser, setAssignUser] = useState<AdminUser | null>(null);
    const [assignRole, setAssignRole] = useState<ProjectRole>('viewer');
    const [confirmDelete, setConfirmDelete] = useState(false);

    // a fixed page size keeps the list the same height however many projects exist
    const list = usePagedList(
        ({ page, limit, q }) => api.adminListProjects({ page, limit, q }),
        { limit: PAGE_SIZE }
    );

    const choose = useCallback((p: AdminProject | null) => {
        setSelectedId(p?.id ?? null);
        setSelectedCache(p);
    }, []);

    // the fresh copy from the list wins; the cache covers other pages
    const selected = useMemo(
        () =>
            list.items.find((p) => p.id === selectedId) ??
            (selectedCache?.id === selectedId ? selectedCache : null),
        [list.items, selectedId, selectedCache]
    );

    // open the first project once the list arrives
    useEffect(() => {
        if (!selectedId && list.items.length > 0) choose(list.items[0]);
    }, [selectedId, list.items, choose]);

    const reloadMembers = useCallback(async (id: string | null) => {
        if (!id) {
            setMembers([]);
            return;
        }
        try {
            setMembers(await api.adminListProjectMembers(id));
        } catch (e) {
            setError(errorMessage(e));
        }
    }, []);

    useEffect(() => {
        void reloadMembers(selectedId);
    }, [selectedId, reloadMembers]);

    useEffect(() => {
        setEditName(selected?.name ?? '');
        setEditDescription(selected?.description ?? '');
    }, [selected?.id, selected?.name, selected?.description]);

    const run = async (fn: () => Promise<unknown>) => {
        setError(null);
        setBusy(true);
        try {
            await fn();
            list.reload();
            await reloadMembers(selectedId);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const memberIds = useMemo(
        () => new Set(members.map((m) => m.userId)),
        [members]
    );

    return (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <div className="flex flex-col gap-4">
                <form
                    className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm"
                    aria-label="Create project"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                            const p = await api.adminCreateProject({
                                name,
                                description,
                            });
                            setName('');
                            setDescription('');
                            choose(p);
                        });
                    }}
                >
                    <h2 className="font-primary text-base font-semibold">
                        New project
                    </h2>
                    <Input
                        placeholder="Project name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        required
                    />
                    <Input
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={500}
                    />
                    <Button type="submit" disabled={busy}>
                        Create project
                    </Button>
                </form>

                {list.error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {list.error}
                    </p>
                ) : null}
                <div className="flex flex-col gap-2">
                    <SearchInput
                        value={list.query}
                        onChange={list.setQuery}
                        placeholder="Search projects…"
                        label="Search projects"
                    />
                    <ul
                        className="flex max-h-[22rem] min-h-32 flex-col gap-1 overflow-y-auto"
                        aria-label="Projects"
                        data-testid="project-list"
                    >
                        {list.initialLoading ? (
                            <li className="text-sm text-muted-foreground">
                                Loading…
                            </li>
                        ) : list.items.length === 0 ? (
                            <li className="text-sm text-muted-foreground">
                                {list.query
                                    ? `No projects match "${list.query}".`
                                    : 'No projects yet. Create the first one above.'}
                            </li>
                        ) : (
                            list.items.map((p) => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => choose(p)}
                                        className={cn(
                                            'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm',
                                            p.id === selectedId
                                                ? 'border-primary bg-accent text-accent-foreground'
                                                : 'border-transparent hover:bg-muted'
                                        )}
                                    >
                                        <span className="font-medium">
                                            {p.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {p.members} member
                                            {p.members === 1 ? '' : 's'} ·{' '}
                                            {p.diagrams} diagram
                                            {p.diagrams === 1 ? '' : 's'}
                                        </span>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                    <ListPager
                        page={list.page}
                        pageCount={list.pageCount}
                        limit={list.limit}
                        total={list.total}
                        onPageChange={list.setPage}
                        disabled={list.loading}
                        noun="projects"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                {selected ? (
                    <>
                        <form
                            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
                            aria-label="Project details"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void run(async () => {
                                    const updated =
                                        await api.adminUpdateProject(
                                            selected.id,
                                            {
                                                name: editName,
                                                description: editDescription,
                                            }
                                        );
                                    // keep the shown copy right when it is not on this page
                                    setSelectedCache((c) =>
                                        c ? { ...c, ...updated } : c
                                    );
                                });
                            }}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="font-primary text-base font-semibold">
                                    Project details
                                </h2>
                                <Button
                                    asChild
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                >
                                    <Link to={projectHomePath(selected.slug)}>
                                        Open workspace
                                    </Link>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Web address:{' '}
                                <code>{projectHomePath(selected.slug)}</code>.
                                Renaming the project changes it.
                            </p>
                            <Input
                                aria-label="Project name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                maxLength={100}
                                required
                            />
                            <Input
                                aria-label="Project description"
                                value={editDescription}
                                onChange={(e) =>
                                    setEditDescription(e.target.value)
                                }
                                maxLength={500}
                                placeholder="Description"
                            />
                            <div className="flex justify-between">
                                <Button
                                    type="submit"
                                    variant="secondary"
                                    disabled={
                                        busy ||
                                        (editName === selected.name &&
                                            editDescription ===
                                                selected.description)
                                    }
                                >
                                    Save changes
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => setConfirmDelete(true)}
                                >
                                    Delete project
                                </Button>
                            </div>
                        </form>

                        <section
                            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
                            aria-label="Project members"
                        >
                            <div>
                                <h2 className="font-primary text-base font-semibold">
                                    Members and permissions
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Admins always have full access. Everyone
                                    else only sees projects they are assigned
                                    to.
                                </p>
                            </div>

                            <form
                                className="flex flex-col gap-2 md:flex-row"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!assignUser) return;
                                    void run(async () => {
                                        await api.adminSetProjectMember(
                                            selected.id,
                                            assignUser.id,
                                            assignRole
                                        );
                                        setAssignUser(null);
                                    });
                                }}
                            >
                                <div className="md:flex-1">
                                    <UserPicker
                                        selected={assignUser}
                                        onSelect={setAssignUser}
                                        excludeIds={memberIds}
                                    />
                                </div>
                                <OptionSelect
                                    aria-label="Permission for new member"
                                    className="w-full md:w-32"
                                    value={assignRole}
                                    onValueChange={(v) =>
                                        setAssignRole(v as ProjectRole)
                                    }
                                    options={ROLE_OPTIONS}
                                />
                                <Button
                                    type="submit"
                                    disabled={busy || !assignUser}
                                >
                                    Assign
                                </Button>
                            </form>
                            <p className="text-xs text-muted-foreground">
                                {roleHelp[assignRole]}
                            </p>

                            <ul
                                className="flex flex-col divide-y"
                                aria-label="Assigned users"
                            >
                                {members.length === 0 ? (
                                    <li className="py-2 text-sm text-muted-foreground">
                                        Nobody is assigned yet.
                                    </li>
                                ) : (
                                    members.map((m) => (
                                        <li
                                            key={m.userId}
                                            className="flex items-center justify-between gap-2 py-2 text-sm"
                                        >
                                            <span className="truncate">
                                                {m.email}
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <OptionSelect
                                                    size="sm"
                                                    className="w-28"
                                                    aria-label={`Permission for ${m.email}`}
                                                    value={m.role}
                                                    disabled={busy}
                                                    onValueChange={(v) =>
                                                        void run(() =>
                                                            api.adminSetProjectMember(
                                                                selected.id,
                                                                m.userId,
                                                                v as ProjectRole
                                                            )
                                                        )
                                                    }
                                                    options={ROLE_OPTIONS}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        run(() =>
                                                            api.adminRemoveProjectMember(
                                                                selected.id,
                                                                m.userId
                                                            )
                                                        )
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </span>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </section>
                    </>
                ) : !list.initialLoading ? (
                    <p className="text-sm text-muted-foreground">
                        Select or create a project to manage who can access it.
                    </p>
                ) : null}
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete project?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {selected?.name} and its member assignments will be
                            removed. A project that still contains diagrams
                            cannot be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (selected) {
                                    void run(async () => {
                                        await api.adminDeleteProject(
                                            selected.id
                                        );
                                        choose(null);
                                    });
                                }
                            }}
                        >
                            Delete project
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
