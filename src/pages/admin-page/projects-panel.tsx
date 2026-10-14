import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
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

const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm';

const roleHelp: Record<ProjectRole, string> = {
    editor: 'Can create and edit diagrams in this project',
    viewer: 'Can only read published diagrams',
};

export const ProjectsPanel: React.FC = () => {
    const [projects, setProjects] = useState<AdminProject[] | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [assignUserId, setAssignUserId] = useState('');
    const [assignRole, setAssignRole] = useState<ProjectRole>('viewer');
    const [confirmDelete, setConfirmDelete] = useState(false);

    const selected = useMemo(
        () => projects?.find((p) => p.id === selectedId) ?? null,
        [projects, selectedId]
    );

    const reloadProjects = useCallback(async () => {
        try {
            const list = await api.adminListProjects();
            setProjects(list);
            setSelectedId((cur) =>
                cur && list.some((p) => p.id === cur)
                    ? cur
                    : (list[0]?.id ?? null)
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }, []);

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
        void reloadProjects();
        api.adminListUsers()
            .then(setUsers)
            .catch((e) => setError(errorMessage(e)));
    }, [reloadProjects]);

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
            await Promise.all([reloadProjects(), reloadMembers(selectedId)]);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const assignable = users.filter(
        (u) => !members.some((m) => m.userId === u.id)
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
                            setSelectedId(p.id);
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

                <ul
                    className="flex flex-col gap-1"
                    aria-label="Projects"
                    data-testid="project-list"
                >
                    {projects === null ? (
                        <li className="text-sm text-muted-foreground">
                            Loading…
                        </li>
                    ) : projects.length === 0 ? (
                        <li className="text-sm text-muted-foreground">
                            No projects yet. Create the first one above.
                        </li>
                    ) : (
                        projects.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(p.id)}
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
                                void run(() =>
                                    api.adminUpdateProject(selected.id, {
                                        name: editName,
                                        description: editDescription,
                                    })
                                );
                            }}
                        >
                            <h2 className="font-primary text-base font-semibold">
                                Project details
                            </h2>
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
                                    if (!assignUserId) return;
                                    void run(async () => {
                                        await api.adminSetProjectMember(
                                            selected.id,
                                            assignUserId,
                                            assignRole
                                        );
                                        setAssignUserId('');
                                    });
                                }}
                            >
                                <select
                                    className={cn(selectClass, 'md:flex-1')}
                                    aria-label="User to assign"
                                    value={assignUserId}
                                    onChange={(e) =>
                                        setAssignUserId(e.target.value)
                                    }
                                >
                                    <option value="">
                                        {assignable.length === 0
                                            ? 'Everyone is already assigned'
                                            : 'Choose a user…'}
                                    </option>
                                    {assignable.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.email}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className={selectClass}
                                    aria-label="Permission for new member"
                                    value={assignRole}
                                    onChange={(e) =>
                                        setAssignRole(
                                            e.target.value as ProjectRole
                                        )
                                    }
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                </select>
                                <Button
                                    type="submit"
                                    disabled={busy || !assignUserId}
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
                                                <select
                                                    className={selectClass}
                                                    aria-label={`Permission for ${m.email}`}
                                                    value={m.role}
                                                    disabled={busy}
                                                    onChange={(e) =>
                                                        run(() =>
                                                            api.adminSetProjectMember(
                                                                selected.id,
                                                                m.userId,
                                                                e.target
                                                                    .value as ProjectRole
                                                            )
                                                        )
                                                    }
                                                >
                                                    <option value="viewer">
                                                        Viewer
                                                    </option>
                                                    <option value="editor">
                                                        Editor
                                                    </option>
                                                </select>
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
                ) : projects !== null ? (
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
                                    void run(() =>
                                        api.adminDeleteProject(selected.id)
                                    );
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
